// 記事用の再現コード。読者がそのまま実行できることを確認するために置いている。
//   npm install mupdf && node repro.mjs
import * as mupdf from "mupdf";

const SECRET = "SECRET-Yamada-Taro-090-1234-5678";

// ── 1. 秘密を含む PDF を作る（外部フォント不要の標準14書体を使う）──
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

// ── 2. 2行目を墨消しして、指定した保存方法で書き出す ──
function redact(bytes, saveOptions) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const page = doc.loadPage(0);
  // PDF 座標(左下原点) の y=650 付近 → mupdf 座標(左上原点)
  const annot = page.createAnnotation("Redact");
  annot.setRect([45, 842 - 668, 400, 842 - 645]);
  page.update();
  page.applyRedactions(
    true,
    mupdf.PDFPage.REDACT_IMAGE_REMOVE,
    mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
    mupdf.PDFPage.REDACT_TEXT_REMOVE,
  );
  return Uint8Array.from(doc.saveToBuffer(saveOptions).asUint8Array());
}

// ── 3-a. 通常の確認方法：テキスト抽出 ──
function extractText(bytes) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const st = doc.loadPage(0).toStructuredText("preserve-whitespace");
  const json = JSON.parse(st.asJSON());
  return (json.blocks ?? [])
    .flatMap((b) => b.lines ?? [])
    .map((l) => l.text)
    .join(" ");
}

// ── 3-b. ファイル内の全ストリームを走査する ──
function scanAllStreams(bytes) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const hits = [];
  for (let i = 1; i < doc.countObjects(); i++) {
    // isStream()/readStream() は間接参照に対して呼ぶ。
    // resolve() 後の辞書に対して呼ぶと常に false になる。
    const ref = doc.newIndirect(i);
    if (!ref.isStream()) continue;
    const body = new TextDecoder("latin1").decode(ref.readStream().asUint8Array());
    if (body.includes(SECRET)) hits.push(i);
  }
  return hits;
}

// ── 実行 ──
const source = makeSource();
console.log(`元ファイル: テキスト抽出 = ${extractText(source).includes(SECRET) ? "秘密が読める" : "読めない"}\n`);

const patterns = ["incremental", "", "compress", "compress,garbage=compact", "compress,garbage=deduplicate"];

console.log("保存オプション                   テキスト抽出   全ストリーム走査");
console.log("─".repeat(66));
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

// ── 4. 残っているものの正体を確かめる ──
console.log("\n【gc 無しで保存した場合の内訳】");
{
  const out = redact(source, "compress");
  const doc = mupdf.PDFDocument.openDocument(out, "application/pdf");
  const contentsRef = doc.findPage(0).get("Contents");
  const referenced = contentsRef.isIndirect() ? contentsRef.asIndirect() : null;
  const body = new TextDecoder("latin1").decode(contentsRef.readStream().asUint8Array());

  console.log(`  ページが参照する Contents : obj ${referenced}`);
  console.log(`    → SECRET を含む         : ${body.includes(SECRET) ? "はい" : "いいえ"}`);
  const hits = scanAllStreams(out);
  console.log(`  SECRET を含むオブジェクト : ${JSON.stringify(hits)}`);
  console.log(`  → うちページ非参照(孤児)  : ${JSON.stringify(hits.filter((i) => i !== referenced))}`);
  console.log(`  テキスト抽出の見え方      : ${extractText(out).includes(SECRET) ? "秘密が見える" : "安全に見える"}`);
}
