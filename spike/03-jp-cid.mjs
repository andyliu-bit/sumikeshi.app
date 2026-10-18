// 日本語 CID フォント（Identity-H）での墨消し検証。
// 日本語 PDF は 1 バイト Latin とは別のコードパスを通るため単独で検証する。
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync, statSync } from "node:fs";

const PAGE_W = 595, PAGE_H = 842;
const PUBLIC_TXT = "令和8年度 公開資料";
const SECRET_TXT = "氏名：山田太郎 電話：090-1234-5678";

// ── 1) MS Gothic を .ttc の subfont 0 として読み込み ──
const ttc = readFileSync("C:/Windows/Fonts/msgothic.ttc");
const font = new mupdf.Font("MS-Gothic", ttc, 0);
console.log("[1] フォント読込:", font.getName());

const doc = new mupdf.PDFDocument();
// addFont = TTF 完全埋め込み + Identity encoding（CIDToGIDMap=Identity）。
// この場合のみ font.encodeCharacter() の glyph id が content stream の CID と一致する。
const fontRef = doc.addFont(font);

// Identity-H: content stream には glyph id を 2 バイト hex で書く
const toHex = (s) =>
  [...s].map((ch) => font.encodeCharacter(ch.codePointAt(0)).toString(16).padStart(4, "0")).join("");

const SIZE = 14;
// 黒塗り矩形（PDF 座標：原点左下）
const BOX = { x: 50, y: 694, w: 330, h: 24 };

const contents = `
BT /F1 ${SIZE} Tf 55 760 Td <${toHex(PUBLIC_TXT)}> Tj ET
BT /F1 ${SIZE} Tf 55 700 Td <${toHex(SECRET_TXT)}> Tj ET
0 0 0 rg ${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h} re f
`;

const resources = doc.addObject({ Font: { F1: fontRef } });
const page0 = doc.addPage([0, 0, PAGE_W, PAGE_H], 0, resources, contents);
doc.insertPage(-1, page0);
writeFileSync("jp-bad.pdf", doc.saveToBuffer("compress").asUint8Array());
console.log("[1] jp-bad.pdf 生成（黒塗り矩形で覆っただけ）");

// ── 2) 抽出（処理前） ────────────────────────────────
function extract(file, label) {
  const d = mupdf.PDFDocument.openDocument(readFileSync(file), "application/pdf");
  const json = JSON.parse(d.loadPage(0).toStructuredText("preserve-whitespace").asJSON());
  const lines = [];
  for (const b of json.blocks ?? []) for (const l of b.lines ?? []) if (l.text?.trim()) lines.push(l.text);
  console.log(`\n--- テキスト抽出 [${label}] ---`);
  lines.forEach((l) => console.log("   ", l));
  return lines.join("\n");
}
const before = extract("jp-bad.pdf", "処理前");
const leakBefore = before.includes("山田太郎") && before.includes("090-1234-5678");
console.log(`\n[判定] 処理前に個人情報が読める: ${leakBefore ? "YES（事故再現）" : "no"}`);

// ── 3) 墨消し実行 ────────────────────────────────────
const d2 = mupdf.PDFDocument.openDocument(readFileSync("jp-bad.pdf"), "application/pdf");
const p2 = d2.loadPage(0);
// PDF 座標(左下原点) → mupdf 座標(左上原点)
const rect = [BOX.x, PAGE_H - (BOX.y + BOX.h), BOX.x + BOX.w, PAGE_H - BOX.y];
const annot = p2.createAnnotation("Redact");
annot.setRect(rect);
p2.update();
p2.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_REMOVE,
  mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);

// メタデータ除去も同時に検証
for (const k of ["info:Title", "info:Author", "info:Subject", "info:Keywords", "info:Creator"]) {
  try { d2.setMetaData(k, ""); } catch {}
}
writeFileSync("jp-redacted.pdf", d2.saveToBuffer("compress,garbage=compact").asUint8Array());
console.log("\n[3] jp-redacted.pdf 保存");

// ── 4) 検証 ──────────────────────────────────────────
const after = extract("jp-redacted.pdf", "処理後");
const leakAfter = after.includes("山田太郎") || after.includes("090-1234-5678");
const publicKept = after.includes("公開資料");

// 生バイト列に glyph id 列が残っていないか（増分更新履歴の残骸チェック）
const rawHex = readFileSync("jp-redacted.pdf").toString("latin1");
const secretGids = toHex("山田太郎");
const rawHit = rawHex.toLowerCase().includes(secretGids.toLowerCase());

console.log("\n════════ 日本語 CID 検証結果 ════════");
console.log(`  処理前 個人情報が読める     : ${leakBefore ? "YES" : "no"}`);
console.log(`  処理後 個人情報が読める     : ${leakAfter ? "YES ← 失敗" : "no ← OK"}`);
console.log(`  処理後 公開部分は保持       : ${publicKept ? "YES ← OK" : "no ← 消えすぎ"}`);
console.log(`  処理後 生バイトに glyph 残存: ${rawHit ? "YES ← 失敗" : "no ← OK"}`);
console.log(`  サイズ: ${statSync("jp-bad.pdf").size} → ${statSync("jp-redacted.pdf").size} bytes`);
const pass = leakBefore && !leakAfter && publicKept && !rawHit;
console.log(`\n  判定: ${pass ? "PASS — 日本語でも真墨消し成立" : "FAIL"}`);
process.exit(pass ? 0 : 1);
