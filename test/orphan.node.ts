// 孤児オブジェクトの中身の復元を、実データの複数ページ文書で検証する。
//
// 合成サンプルは 1 ページなので「復元にどのページの資源を使うか」を検証できない。
// ここでは 3 ページ目に墨消しをかけて gc 無しで保存し、
// 孤児が 1 ページ目ではなく正しいページの資源で解釈されることを確かめる。
import { existsSync, readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createAnalyzer } from "../lib/analyze.ts";

const SRC = "samples-real/digital-2023-minutes.pdf";
if (!existsSync(SRC)) {
  console.log(`（${SRC} が無いためスキップ）`);
  process.exit(0);
}

const TARGET_PAGE = 2; // 0 始まり。あえて先頭ページを避ける

// ── 3ページ目の 1 行を選んで墨消しし、gc 無しで保存する ──
const doc = mupdf.PDFDocument.openDocument(readFileSync(SRC), "application/pdf") as mupdf.PDFDocument;
const page = doc.loadPage(TARGET_PAGE) as mupdf.PDFPage;
const stext = page.toStructuredText("preserve-whitespace");
const json = JSON.parse(stext.asJSON());

type Line = { text?: string; bbox: { x: number; y: number; w: number; h: number } };
const lines: Line[] = (json.blocks ?? [])
  .flatMap((b: { lines?: Line[] }) => b.lines ?? [])
  .filter((l: Line) => (l.text ?? "").trim().length >= 8);

if (lines.length === 0) {
  console.log("FAIL  対象にできる行が見つからない");
  process.exit(1);
}
const target = lines[0];
const targetText = (target.text ?? "").trim();
console.log(`対象 (${TARGET_PAGE + 1}ページ目): "${targetText}"`);

const b = target.bbox;
const annot = page.createAnnotation("Redact");
annot.setRect([b.x, b.y, b.x + b.w, b.y + b.h]);
page.update();
page.applyRedactions(
  true,
  mupdf.PDFPage.REDACT_IMAGE_REMOVE,
  mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
  mupdf.PDFPage.REDACT_TEXT_REMOVE,
);

// asUint8Array() は WASM ヒープを指す視図で、analyze に渡すと detach される。
// 2 回解析するのでコピーを取る。
// gc 無し = 旧 content stream が孤児として残る（これが再現したい事故）
const bad = Uint8Array.from(doc.saveToBuffer("compress").asUint8Array());
// 正しい保存。こちらは孤児が出ないこと（対照）
const good = Uint8Array.from(doc.saveToBuffer("compress,garbage=deduplicate").asUint8Array());

// ── 検証 ────────────────────────────────────────────────
const analyze = createAnalyzer(mupdf);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const badReport = analyze(bad);
const recovered = badReport.orphans.flatMap((o) => o.recovered);

check("gc 無し保存で孤児が検出される", badReport.orphans.length > 0,
  `孤児 ${badReport.orphans.length} 件`);

check(
  "孤児から削除された行が復元される",
  recovered.some((t) => t.includes(targetText) || targetText.includes(t)),
  `復元 ${recovered.length} 行: ${JSON.stringify(recovered.slice(0, 3))}`,
);

// 復元されるのは「消えた行」だけであるべき。ページ全文が返ると本文に埋もれる
const pageLineCount = lines.length;
check(
  "復元されるのは消えた行だけ（全文ではない）",
  recovered.length < pageLineCount,
  `復元 ${recovered.length} 行 / ページ全体 ${pageLineCount} 行以上`,
);

const goodReport = analyze(good);
check("gc 有り保存では孤児が出ない", goodReport.orphans.length === 0,
  `孤児 ${goodReport.orphans.length} 件`);

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
