// 増分保存で残る過去の版と、XMP の扱いを検証する。
//
// 以前は「同じオブジェクト番号を書き換えて増分保存」したファイルを「問題なし」と
// 判定していた。孤児は生まれないが、最初の %%EOF で切れば旧版がそのまま読める。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as mupdf from "mupdf";
import { createAnalyzer, revisionEnds, summarizeXmp } from "../lib/analyze.ts";
import { createRedactor } from "../lib/redact.ts";

const analyze = createAnalyzer(mupdf);
const redact = createRedactor(mupdf);
const SECRET = "SECRET-Yamada-Taro-090-1234-5678";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

// 秘密を含む 1 ページの PDF（標準 14 書体なので外部フォント不要）
function makeSource(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  const res = doc.addObject({ Font: { F1: font } });
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, res,
    `BT /F1 14 Tf 50 700 Td (PUBLIC) Tj ET\nBT /F1 14 Tf 50 650 Td (${SECRET}) Tj ET`));
  return Uint8Array.from(doc.saveToBuffer("compress").asUint8Array());
}

// 他ツールの「その場で書き換えて上書き保存」を模す
function rewriteInPlaceIncremental(src: Uint8Array): Uint8Array {
  const doc = mupdf.PDFDocument.openDocument(src, "application/pdf") as mupdf.PDFDocument;
  doc.findPage(0).get("Contents").writeStream(new TextEncoder().encode("BT /F1 14 Tf 50 700 Td (PUBLIC) Tj ET"));
  return Uint8Array.from(doc.saveToBuffer("incremental").asUint8Array());
}

console.log("── 増分保存の過去の版 ──");
const source = makeSource();
const incremental = rewriteInPlaceIncremental(source);

const before = analyze(source);
check("対照: 増分保存していない元ファイルは過去の版なし", before.pastVersionText.length === 0);

const r = analyze(incremental);
check("同一オブジェクト書き換え＋増分保存を「危険」と判定する", r.verdict === "danger", `verdict=${r.verdict}`);
check("過去の版にだけ残る秘密を表示する", r.pastVersionText.includes(SECRET),
  `pastVersionText=${JSON.stringify(r.pastVersionText)}`);
check("現在も見えている行は報告しない", !r.pastVersionText.includes("PUBLIC"));
check("孤児とは別物として扱う（孤児は 0 件）", r.orphans.length === 0, `orphans=${r.orphans.length}`);

console.log("\n── 墨消しすると過去の版も消える ──");
const cleaned = redact(incremental, [{ page: 0, x: 0, y: 0, w: 1, h: 1 }]);
check("出力は 1 版だけ", revisionEnds(cleaned.pdf).length === 1, `ends=${revisionEnds(cleaned.pdf).length}`);
check("出力の過去の版は 0 件", cleaned.report.pastVersionText.length === 0);

console.log("\n── XMP ──");
check("summarizeXmp: 要素形式を読む",
  summarizeXmp("<x><dc:creator><rdf:Seq><rdf:li>山田 花子</rdf:li></rdf:Seq></dc:creator></x>") === "dc:creator: 山田 花子");
check("summarizeXmp: 属性形式を読む",
  summarizeXmp(`<rdf:Description pdf:Producer="Word 2021"/>`) === "pdf:Producer: Word 2021");
check("summarizeXmp: 特定に使える項目が無ければ空（警告しない）", summarizeXmp("<x><dc:creator></dc:creator><xmpMM:DocumentID>uuid:1</xmpMM:DocumentID></x>") === "");
check("summarizeXmp: XML 実体参照を戻す", summarizeXmp("<x><dc:title>A &amp; B &#x5C71;</dc:title></x>") === "dc:title: A & B 山");

console.log("\n── 審査で見つかった残り方 ──");
// 利用者パスワード付き: 開けるが復号できず、以前は「検出なし」になっていた
{
  const doc = mupdf.PDFDocument.openDocument(source, "application/pdf") as mupdf.PDFDocument;
  const locked = Uint8Array.from(doc.saveToBuffer("encrypt=aes-256,user-password=u,owner-password=o").asUint8Array());
  const threw = (f: () => unknown) => { try { f(); return false; } catch (e) { return /パスワード/.test(String(e)); } };
  check("パスワード付き PDF は診断せずエラーにする", threw(() => analyze(locked)));
  check("パスワード付き PDF は墨消しもせずエラーにする", threw(() => redact(locked, [])));
}
// 最後の %%EOF が欠けた壊れたファイル: 最後の区切りが一つ前の版になる
{
  const s = new TextDecoder("latin1").decode(incremental);
  const broken = incremental.slice(0, s.lastIndexOf("%%EOF"));
  check("最後の %%EOF が欠けていても過去の版を見逃さない", analyze(broken).pastVersionText.includes(SECRET));
}
// 版が上限を超えても、秘密が最初の版にしか無い場合を見逃さない
{
  let b = incremental;
  for (let i = 0; i < 16; i++) {
    const d = mupdf.PDFDocument.openDocument(b, "application/pdf") as mupdf.PDFDocument;
    d.setMetaData("info:Subject", `rev ${i}`);
    b = Uint8Array.from(d.saveToBuffer("incremental").asUint8Array());
  }
  const rep = analyze(b);
  check(`版が多くても最初の版の秘密を見逃さない（${revisionEnds(b).length} 版）`, rep.pastVersionText.includes(SECRET));
}
// 行に追記しただけ（何も消していない）を過去の版として報告しない
{
  const d = mupdf.PDFDocument.openDocument(source, "application/pdf") as mupdf.PDFDocument;
  d.findPage(0).get("Contents").writeStream(new TextEncoder().encode(
    `BT /F1 14 Tf 50 700 Td (PUBLIC) Tj ET\nBT /F1 14 Tf 50 650 Td (${SECRET} appended) Tj ET`));
  const appended = Uint8Array.from(d.saveToBuffer("incremental").asUint8Array());
  check("追記しただけの行は過去の版として報告しない", analyze(appended).pastVersionText.length === 0);
}
// ページに付いた XMP と、標準外の Info 項目
{
  const d = mupdf.PDFDocument.openDocument(source, "application/pdf") as mupdf.PDFDocument;
  const dict = d.newDictionary();
  dict.put("Type", d.newName("Metadata"));
  dict.put("Subtype", d.newName("XML"));
  d.findPage(0).put("Metadata", d.addStream("<x:xmpmeta><dc:creator>山田 花子</dc:creator></x:xmpmeta>", dict));
  d.setMetaData("info:Company", "株式会社サンプル");
  const withMeta = Uint8Array.from(d.saveToBuffer("compress").asUint8Array());
  const rep = analyze(withMeta);
  check("ページに付いた XMP を検出する", rep.metadata.some((m) => m.key.startsWith("XMP") && m.value.includes("山田 花子")),
    JSON.stringify(rep.metadata));
  check("標準外の Info 項目（Company）を検出する", rep.metadata.some((m) => m.key === "Company"));
  const out = redact(withMeta, []);
  check("範囲 0 件の墨消しでページの XMP と Company が消える", out.verified && out.report.metadata.length === 0,
    `verdict=${out.report.verdict} metadata=${JSON.stringify(out.report.metadata)}`);
  check("出力に xmpmeta が残らない", !new TextDecoder("latin1").decode(out.pdf).includes("xmpmeta"));
}
// 表示範囲（CropBox）の外に置いた文字
{
  const d = mupdf.PDFDocument.openDocument(source, "application/pdf") as mupdf.PDFDocument;
  d.findPage(0).put("CropBox", [0, 0, 595, 680]);
  const cropped = Uint8Array.from(d.saveToBuffer("compress").asUint8Array());
  const rep = analyze(cropped);
  check("CropBox の外の文字を検出する", rep.hiddenText.some((h) => h.text.includes("PUBLIC")),
    JSON.stringify(rep.hiddenText.map((h) => h.text)));
  check("CropBox の内側の文字は誤検出しない", !rep.hiddenText.some((h) => h.text.includes(SECRET)));
}

// 実データ（公開資料のため再配布しない。無ければスキップ）
const REAL = "samples-real";
if (existsSync(REAL)) {
  console.log("\n── 実データ ──");
  const files = readdirSync(REAL).filter((f) => f.endsWith(".pdf"));
  const falsePositives: string[] = [];
  for (const f of files) {
    const rep = analyze(Uint8Array.from(readFileSync(`${REAL}/${f}`)));
    if (rep.pastVersionText.length) falsePositives.push(`${f}: ${JSON.stringify(rep.pastVersionText.slice(0, 2))}`);
  }
  check(`複数版の実データでも過去の版を誤報しない（${files.length} 件）`, falsePositives.length === 0, falsePositives.join(" / "));

  const word = `${REAL}/digital-2025-minutes.pdf`;
  if (existsSync(word)) {
    const wbytes = Uint8Array.from(readFileSync(word));
    check("診断が XMP を検出する", analyze(wbytes).metadata.some((m) => m.key === "XMP"));
    const out = redact(wbytes, [{ page: 0, x: 0, y: 0, w: 1, h: 1 }]);
    const outDoc = mupdf.PDFDocument.openDocument(out.pdf, "application/pdf") as mupdf.PDFDocument;
    check("墨消しの出力にカタログの /Metadata が無い", outDoc.getTrailer().get("Root").get("Metadata").isNull());
    check("墨消しの出力に xmpmeta が残らない", !new TextDecoder("latin1").decode(out.pdf).includes("xmpmeta"));
    check("墨消しの出力は「検出なし」で検証を通る", out.verified, `verdict=${out.report.verdict} metadata=${JSON.stringify(out.report.metadata)}`);
  }
} else {
  console.log(`\n（${REAL} が無いため実データ検証はスキップ）`);
}

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
