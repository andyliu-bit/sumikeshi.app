// 墨消し本体の検証。
// 「消えたこと」だけでなく「消しすぎていないこと」「痕跡が残らないこと」まで見る。
import { readFileSync, writeFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createRedactor, type Area } from "../lib/redact.ts";
import { createAnalyzer } from "../lib/analyze.ts";

const redact = createRedactor(mupdf);
const analyze = createAnalyzer(mupdf);

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

// ── ケース1: 日本語・黒枠で覆っただけのファイルを正しく墨消しする ──
console.log("\n■ ケース1: jp-bad.pdf（氏名と電話番号を墨消し）");
{
  const src = readFileSync("spike/jp-bad.pdf");

  // 診断で見つかった漏洩箇所をそのまま墨消し対象にする
  const pre = analyze(src);
  check("処理前は danger", pre.verdict === "danger");
  const areas: Area[] = pre.hiddenText.map((h) => ({ page: h.page, ...h.bbox }));
  console.log(`   対象領域: ${areas.length} 件`);

  const r = redact(src, areas);
  writeFileSync("samples-real/jp-redacted-out.pdf", r.pdf);

  check("削除内容を採取できた", r.removed.length > 0, r.removed.join(" / "));
  check("削除対象が読み取れない", r.stillReadable.length === 0, r.stillReadable.join(" / "));
  check("処理後の診断が clean", r.report.verdict === "clean", `verdict=${r.report.verdict}`);
  check("孤児オブジェクトなし", r.report.orphans.length === 0);
  check("メタデータなし", r.report.metadata.length === 0);
  check("verified フラグ", r.verified);

  // 消しすぎていないこと: 公開部分は残っている
  const doc = mupdf.PDFDocument.openDocument(r.pdf, "application/pdf");
  const text = JSON.parse(doc.loadPage(0).toStructuredText("preserve-whitespace").asJSON())
    .blocks.flatMap((b: any) => (b.lines ?? []).map((l: any) => l.text)).join(" ");
  check("公開部分は保持", text.includes("公開資料"), `残存テキスト="${text.trim()}"`);
  check("個人情報は消えている", !text.includes("山田太郎") && !text.includes("090-1234-5678"));
}

// ── ケース2: 縦書きでも同じ結果になるか ──
console.log("\n■ ケース2: vertical-bad.pdf（縦書き1列を墨消し）");
{
  const src = readFileSync("samples-real/vertical-bad.pdf");
  const pre = analyze(src);
  const areas: Area[] = pre.hiddenText.map((h) => ({ page: h.page, ...h.bbox }));

  const r = redact(src, areas);
  check("削除内容を採取できた", r.removed.length > 0, r.removed.join(" / "));
  check("処理後の診断が clean", r.report.verdict === "clean", `verdict=${r.report.verdict}`);
  check("verified フラグ", r.verified);

  const doc = mupdf.PDFDocument.openDocument(r.pdf, "application/pdf");
  const text = JSON.parse(doc.loadPage(0).toStructuredText("preserve-whitespace").asJSON())
    .blocks.flatMap((b: any) => (b.lines ?? []).map((l: any) => l.text)).join("");
  check("隣の列（公開部分）は保持", text.includes("公"), `残存="${text.trim()}"`);
  check("秘密の列は消えている", !text.includes("山田"));
}

// ── ケース3: 実データ（多ページ）で壊れないか ──
console.log("\n■ ケース3: digital-2025-minutes.pdf（実データ・1領域だけ墨消し）");
{
  const src = readFileSync("samples-real/digital-2025-minutes.pdf");
  const before = analyze(src);
  const doc = mupdf.PDFDocument.openDocument(src, "application/pdf");
  const json = JSON.parse(doc.loadPage(0).toStructuredText("preserve-whitespace").asJSON());
  const firstLine = json.blocks.flatMap((b: any) => b.lines ?? [])[0];

  const r = redact(src, [{ page: 0, ...firstLine.bbox }]);
  check("処理が完了する", r.pdf.length > 0, `${(r.pdf.length / 1024).toFixed(0)}KB`);
  check("ページ数が保たれる", r.report.pageCount === before.pageCount,
    `${before.pageCount} → ${r.report.pageCount}`);
  check("削除対象が読み取れない", r.stillReadable.length === 0);
  check("処理後の診断が clean", r.report.verdict === "clean", `verdict=${r.report.verdict}`);
  check("メタデータが除去された", r.report.metadata.length === 0,
    `処理前 ${before.metadata.length} 件 → 0 件`);
}

console.log(`\n${"═".repeat(52)}`);
console.log(failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`);
process.exit(failed === 0 ? 0 : 1);
