// Spike 主體：驗證 mupdf-wasm 的 applyRedactions 是否真的刪除內容流中的文字。
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { BOX, SECRET } from "./01-make-bad-pdf.mjs";

const PAGE_H = 842;

function extractText(bytes, label) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const page = doc.loadPage(0);
  const stext = page.toStructuredText("preserve-whitespace");
  const json = JSON.parse(stext.asJSON());
  const lines = [];
  for (const block of json.blocks ?? []) {
    for (const line of block.lines ?? []) {
      if (line.text?.trim()) lines.push(line.text);
    }
  }
  console.log(`\n--- 文字抽出 [${label}] ---`);
  lines.forEach((l) => console.log("   ", JSON.stringify(l)));
  return lines.join("\n");
}

// ── STEP 1: 複現問題 ──────────────────────────────────
const original = readFileSync("bad-redaction.pdf");
const textBefore = extractText(original, "処理前");
const leakedBefore = textBefore.includes(SECRET);
console.log(`\n[判定] 処理前に SECRET が読める: ${leakedBefore ? "YES（＝事故再現）" : "no"}`);

// ── STEP 2: 用 Redact 註釋 + applyRedactions ──────────
const doc = mupdf.PDFDocument.openDocument(original, "application/pdf");
const page = doc.loadPage(0);

// pdf-lib(左下原點) → mupdf(左上原點) 座標轉換
const rect = [BOX.x, PAGE_H - (BOX.y + BOX.h), BOX.x + BOX.w, PAGE_H - BOX.y];
console.log("\n[2] Redact 註釋の矩形(mupdf座標):", JSON.stringify(rect));

const annot = page.createAnnotation("Redact");
annot.setRect(rect);
page.update();

page.applyRedactions(
  true,                                        // black_boxes: 保留黑塊外觀
  mupdf.PDFPage.REDACT_IMAGE_REMOVE,           // 覆蓋到的圖像一併移除
  mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
  mupdf.PDFPage.REDACT_TEXT_REMOVE             // 文字真刪除
);
console.log("[2] applyRedactions 実行完了");

// ── STEP 3: full rewrite（防止增量更新歷史殘留） ──────
const out = doc.saveToBuffer("compress,garbage=compact").asUint8Array();
writeFileSync("redacted.pdf", out);
console.log("[3] redacted.pdf 保存");

// ── STEP 4: 驗證 ─────────────────────────────────────
const textAfter = extractText(readFileSync("redacted.pdf"), "処理後");
const leakedAfter = textAfter.includes(SECRET);

// 原始位元組層面搜尋（增量更新歷史 / 未壓縮流殘留）
const raw = readFileSync("redacted.pdf");
const rawHit = raw.includes(Buffer.from(SECRET, "latin1"));

console.log("\n════════ SPIKE 結果 ════════");
console.log(`  処理前 テキスト抽出で漏洩 : ${leakedBefore ? "YES" : "no"}`);
console.log(`  処理後 テキスト抽出で漏洩 : ${leakedAfter ? "YES ← 失敗" : "no ← OK"}`);
console.log(`  処理後 生バイト列に残存   : ${rawHit ? "YES ← 失敗" : "no ← OK"}`);
console.log(`  ファイルサイズ: ${statSync("bad-redaction.pdf").size} → ${statSync("redacted.pdf").size} bytes`);
const pass = leakedBefore && !leakedAfter && !rawHit;
console.log(`\n  判定: ${pass ? "PASS — 真墨消し成立" : "FAIL"}`);
process.exit(pass ? 0 : 1);
