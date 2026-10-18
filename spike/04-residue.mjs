// 残留リスク検証：
//   (A) 増分更新（incremental save）で原本が末尾に残るか
//   (B) メタデータ / 埋め込みファイルの除去
// 「黒枠を消しただけ」の実装が事故になる理由を数値で示す。
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync } from "node:fs";

const PAGE_H = 842;
const BOX = { x: 50, y: 694, w: 330, h: 24 };
const rect = [BOX.x, PAGE_H - (BOX.y + BOX.h), BOX.x + BOX.w, PAGE_H - BOX.y];

const ttc = readFileSync("C:/Windows/Fonts/msgothic.ttc");
const probeFont = new mupdf.Font("MS-Gothic", ttc, 0);
const gidHex = (s) =>
  [...s].map((c) => probeFont.encodeCharacter(c.codePointAt(0)).toString(16).padStart(4, "0")).join("");
const SECRET_GIDS = gidHex("山田太郎").toLowerCase();

function redactedDoc() {
  const d = mupdf.PDFDocument.openDocument(readFileSync("jp-bad.pdf"), "application/pdf");
  const p = d.loadPage(0);
  const a = p.createAnnotation("Redact");
  a.setRect(rect);
  p.update();
  p.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_REMOVE,
    mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
  return d;
}
const residue = (bytes) => bytes.toString("latin1").toLowerCase().includes(SECRET_GIDS);

console.log("═══ (A) 保存方式による残留の差 ═══\n");

const variants = [
  ["incremental                    ", "incremental"],
  ["（オプション無し）             ", ""],
  ["compress                       ", "compress"],
  ["compress,garbage=compact       ", "compress,garbage=compact"],
  ["compress,garbage=deduplicate   ", "compress,garbage=deduplicate"],
];
for (const [label, opt] of variants) {
  let out, err = null;
  try {
    out = Buffer.from(redactedDoc().saveToBuffer(opt).asUint8Array());
  } catch (e) { err = e.message; }
  if (err) { console.log(`  ${label} : ERROR ${err}`); continue; }
  const hit = residue(out);
  console.log(`  ${label} : ${hit ? "残留 YES ← 危険" : "残留 no  ← OK"}   (${out.length} bytes)`);
}

console.log("\n═══ (B) メタデータ除去 ═══\n");
const KEYS = ["info:Title", "info:Author", "info:Subject", "info:Keywords", "info:Creator", "info:Producer"];

const d1 = mupdf.PDFDocument.openDocument(readFileSync("bad-redaction.pdf"), "application/pdf");
console.log("  [処理前] bad-redaction.pdf");
for (const k of KEYS) {
  const v = d1.getMetaData(k);
  if (v) console.log(`    ${k.padEnd(16)} = ${JSON.stringify(v)}`);
}

const d2 = mupdf.PDFDocument.openDocument(readFileSync("bad-redaction.pdf"), "application/pdf");
for (const k of KEYS) { try { d2.setMetaData(k, ""); } catch {} }
const cleaned = Buffer.from(d2.saveToBuffer("compress,garbage=deduplicate").asUint8Array());
writeFileSync("meta-cleaned.pdf", cleaned);

const d3 = mupdf.PDFDocument.openDocument(cleaned, "application/pdf");
console.log("\n  [処理後] meta-cleaned.pdf");
let leftover = [];
for (const k of KEYS) {
  const v = d3.getMetaData(k);
  if (v) { console.log(`    ${k.padEnd(16)} = ${JSON.stringify(v)}  ← 残存`); leftover.push(k); }
}
if (!leftover.length) console.log("    （全て空）← OK");

// 原本の文字列がバイト列に残っていないか
const metaResidue = cleaned.toString("latin1");
for (const probe of ["Naibu-Tantosha-Suzuki", "kojin-joho-list"]) {
  console.log(`    生バイトに "${probe}": ${metaResidue.includes(probe) ? "残留 YES ← 危険" : "残留 no ← OK"}`);
}

console.log("\n  埋め込みファイル数:", Object.keys(d3.getEmbeddedFiles()).length);
