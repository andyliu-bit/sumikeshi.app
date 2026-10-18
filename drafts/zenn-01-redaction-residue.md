---
title: "墨消ししても、保存の仕方で削除前の原本がPDFに残る：コピペでも全文検索でも見つからない『孤児オブジェクト』"
emoji: "🔍"
type: "tech"
topics: ["pdf", "javascript", "security", "wasm"]
published: false
---

## 結論

PDF の墨消し（redaction）を正しく実行しても、**保存時にガベージコレクションを指定しないと、削除前の内容がファイル内にそのまま残る**。

しかも残った内容は、

- 画面に表示されない
- テキスト抽出にも出てこない
- コピー＆ペーストでも取れない

ため、**「消えているか確認した」つもりの確認では見つからない**。ファイル内の全オブジェクトを走査して初めて見える。

## 実行結果

mupdf 1.28.0 (WASM) で、同じ PDF を墨消ししてから保存方法だけを変えて書き出し、2通りの方法で秘密の文字列を探した。再現コードは後半に載せる。

```
保存オプション                   テキスト抽出   全ストリーム走査
──────────────────────────────────────────────────────────────
incremental                      読めない       残存 obj[5]
(なし)                           読めない       残存 obj[5]
compress                         読めない       残存 obj[5]
compress,garbage=compact         読めない       なし
compress,garbage=deduplicate     読めない       なし
```

**テキスト抽出の列は全部「読めない」。** どの保存方法でも、通常の確認では安全に見える。

しかし全ストリームを走査すると、上3つには秘密が丸ごと残っている。

## 前提：黒い四角を重ねるのは墨消しではない

まずよく知られている方の話。PDF に黒い矩形を描画しても、その下のテキストは消えない。描画順序が変わるだけで、テキストオブジェクトは content stream にそのまま残っている。コピー＆ペーストすれば読める。

大分大学（2023年）、木更津市（2025年）、北九州市（2026年7月公表、自主点検で57件）の事例はこれで、[出典つきの事例一覧](https://sumikeshi.app/cases)にまとめている。

これを避けるには、矩形を被せるのではなく**テキストオブジェクトごと削除する**必要がある。PDF の仕様には Redact 注釈があり、mupdf なら `applyRedactions()` で実行できる。

**本題はここから。** その `applyRedactions()` を正しく呼んでも、保存方法を間違えると原本が残る。

## 再現コード

`npm install mupdf` だけで動く。外部フォントもサンプルファイルも要らない。出力は冒頭の「実行結果」に載せた表のとおり。

```js
import * as mupdf from "mupdf";

const SECRET = "SECRET-Yamada-Taro-090-1234-5678";

// 1. 秘密を含む PDF を作る（標準14書体なので外部フォント不要）
function makeSource() {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  const resources = doc.addObject({ Font: { F1: font } });
  const contents = `
BT /F1 14 Tf 50 700 Td (PUBLIC: Annual Report 2026) Tj ET
BT /F1 14 Tf 50 650 Td (${SECRET}) Tj ET
`;
  const page = doc.addPage([0, 0, 595, 842], 0, resources, contents);
  doc.insertPage(-1, page);
  return Uint8Array.from(doc.saveToBuffer("compress").asUint8Array());
}

// 2. 2行目を墨消しして、指定した保存方法で書き出す
function redact(bytes, saveOptions) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const page = doc.loadPage(0);
  const annot = page.createAnnotation("Redact");
  annot.setRect([45, 842 - 668, 400, 842 - 645]); // PDF座標(左下原点) → mupdf座標(左上原点)
  page.update();
  page.applyRedactions(
    true,
    mupdf.PDFPage.REDACT_IMAGE_REMOVE,
    mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
    mupdf.PDFPage.REDACT_TEXT_REMOVE,
  );
  return Uint8Array.from(doc.saveToBuffer(saveOptions).asUint8Array());
}

// 3-a. 通常の確認方法：テキスト抽出
function extractText(bytes) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const st = doc.loadPage(0).toStructuredText("preserve-whitespace");
  return (JSON.parse(st.asJSON()).blocks ?? [])
    .flatMap((b) => b.lines ?? [])
    .map((l) => l.text)
    .join(" ");
}

// 3-b. ファイル内の全ストリームを走査する
function scanAllStreams(bytes) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const hits = [];
  for (let i = 1; i < doc.countObjects(); i++) {
    const ref = doc.newIndirect(i);
    if (!ref.isStream()) continue;
    const body = new TextDecoder("latin1").decode(ref.readStream().asUint8Array());
    if (body.includes(SECRET)) hits.push(i);
  }
  return hits;
}

// 実行
const source = makeSource();
const patterns = ["incremental", "", "compress", "compress,garbage=compact", "compress,garbage=deduplicate"];

for (const opt of patterns) {
  const out = redact(source, opt);
  const visible = extractText(out).includes(SECRET);
  const hits = scanAllStreams(out);
  console.log(
    `${(opt || "(なし)").padEnd(32)} ${(visible ? "読める" : "読めない").padEnd(14)} ${
      hits.length ? `残存 obj${JSON.stringify(hits)}` : "なし"
    }`,
  );
}
```

## 残っているものの正体

`applyRedactions()` は、元の content stream を書き換えるのではなく、**新しい content stream を作ってページの参照先を差し替える**。

つまり保存直前のファイルには、

- **新** content stream（墨消し済み）… ページが参照している
- **旧** content stream（墨消し前）… もう誰も参照していない

の両方が存在する。この「もう誰も参照していない」オブジェクトが**孤児オブジェクト**で、ガベージコレクションを指定しない限り、そのままファイルに書き出される。

上のコードに次を足すと内訳が見える。

```js
const out = redact(source, "compress"); // gc 無し
const doc = mupdf.PDFDocument.openDocument(out, "application/pdf");
const contentsRef = doc.findPage(0).get("Contents");
const referenced = contentsRef.asIndirect();
const hits = scanAllStreams(out);

const body = new TextDecoder("latin1").decode(contentsRef.readStream().asUint8Array());

console.log(`ページが参照する Contents : obj ${referenced}`);
console.log(`  → SECRET を含む         : ${body.includes(SECRET) ? "はい" : "いいえ"}`);
console.log(`SECRET を含むオブジェクト : ${JSON.stringify(hits)}`);
console.log(`→ うちページ非参照(孤児)  : ${JSON.stringify(hits.filter((i) => i !== referenced))}`);
console.log(`テキスト抽出の見え方      : ${extractText(out).includes(SECRET) ? "秘密が見える" : "安全に見える"}`);
```

```
ページが参照する Contents : obj 9
  → SECRET を含む         : いいえ      ← 新しい content stream。墨消し済み
SECRET を含むオブジェクト : [5]          ← 旧い content stream。丸ごと残存
→ うちページ非参照(孤児)  : [5]
テキスト抽出の見え方      : 安全に見える
```

PDF の構造上、参照されていないオブジェクトがあってもファイルとしては正常に開ける。ビューアは無視するだけだ。だが**ファイルを配布すれば、その中身も一緒に配布される**。

## なぜ通常の確認では気づけないのか

墨消しの確認方法としてよく案内されるのは次の2つ。

1. 黒塗り部分をコピーしてメモ帳に貼り付ける
2. 隠したキーワードで全文検索する

どちらも**ページのレンダリング結果とテキストレイヤーしか見ていない**。孤児オブジェクトはページから参照されていないので、レンダリングにもテキスト抽出にも現れない。この2つの確認は必ず「問題なし」になる。

見つけるには、xref を辿って**到達可能なオブジェクトの集合を作り、その補集合を調べる**必要がある。

```js
// trailer から到達可能なオブジェクトを収集
function reachableObjects(doc) {
  const seen = new Set();
  const stack = [doc.getTrailer()];
  while (stack.length) {
    const obj = stack.pop();
    if (!obj || obj.isNull()) continue;
    if (obj.isIndirect()) {
      const num = obj.asIndirect();
      if (seen.has(num)) continue;
      seen.add(num);
      stack.push(obj.resolve());
      continue;
    }
    if (obj.isArray() || obj.isDictionary()) obj.forEach((v) => stack.push(v));
  }
  return seen;
}
```

この集合に入っていないストリームのうち、`BT` と `Tj`/`TJ` を含むものが「文字を描画する孤児」＝残存した原本の候補になる。

## 正しい保存方法

```js
doc.saveToBuffer("compress,garbage=deduplicate");
```

`garbage=compact` でも消える。要は**裸の `saveToBuffer()` を書かない**こと。

PyMuPDF でも同じことが起きる。`page.apply_redactions()` の後に引数なしの `doc.save()` で保存すると（既定値 `garbage=0`）、旧 content stream が孤児オブジェクトとして残る。`garbage=1` 以上を指定すれば消える。`doc.saveIncr()`（増分保存）では墨消し前の版がファイル内にそのまま残るので、墨消し後の保存には使えない。

墨消しを実装するなら、保存部分はコードレビューの必須チェック項目にしたほうがいい。処理そのものは正しいのに、最後の1行で全部無意味になる。

## ハマった点

実装中に踏んだもの。

**`PDFDocument` に `loadObject()` は無い。** オブジェクトを番号で辿るには `doc.newIndirect(i)` を使う。

**`isStream()` / `readStream()` は間接参照そのものに対して呼ぶ。** `resolve()` 済みの辞書に対して呼ぶと**常に false** が返る。これに気づかず、走査コードが全オブジェクトを黙ってスキップしていた時期があった。

そのせいで一度「どの保存方法でも残留なし」という**誤った結論**を出した。検出コードを書いたら、まず**未処理のファイルで検出できることを確認する対照実験**を通すべきだった。「検出されなかった」と「検出する能力が無かった」は、出力を見ただけでは区別が付かない。

## 検証の範囲

正直に書いておく。

- 実測したのは **mupdf 1.28.0 (WASM)** と **PyMuPDF 1.27.2.3（MuPDF 1.27.2）** の挙動。PyMuPDF は MuPDF のバインディングなので、別の実装で確かめたことにはならない
- 孤児オブジェクトが残ること自体は PDF のファイル構造上の性質で、ライブラリ固有ではない。ただし**他ツール（Acrobat 等）が同じ結果になるかは検証していない**
- 日本語（CID フォント）でも同じ現象を確認済み。ただし content stream 内の文字は glyph id なので、上のような素朴な文字列検索では見つからない。グリフ列で照合する必要がある
- **フォントサブセットの残留**は未対応。削除した文字だけが持つ字形は埋め込みフォントに残るため、「どの文字が使われていたか」は漏れうる

## 自分の PDF を確認する

上の走査を毎回書くのは面倒なので、ブラウザ内で完結するツールにした。

https://sumikeshi.app/

- 黒塗りの下に残ったテキスト層
- **孤児オブジェクトに残った原本**（本記事の内容）
- メタデータ・埋め込みファイル

の3項目を見る。ファイルはブラウザ内（WASM）だけで処理していて、サーバーには送信していない。個人情報を含む PDF を外部に上げずに確認できる、というのが作った動機。
