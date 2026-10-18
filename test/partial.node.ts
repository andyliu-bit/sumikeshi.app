// ブラウザで検証失敗を出したケースの再現。
// ユーザーは行にぴったり合わせて囲むわけではなく、複数行をまたぐ雑な矩形を引く。
// そのとき「囲んだ中身は消える」「縁をかすめた隣接テキストは残る」「検証は通る」
// の 3 つが同時に成り立つことを確認する。
import { readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createRedactor, type Area } from "../lib/redact.ts";

const redact = createRedactor(mupdf);
const src = readFileSync("samples-real/digital-2025-minutes.pdf");

const doc = mupdf.PDFDocument.openDocument(src, "application/pdf");
const json = JSON.parse(doc.loadPage(0).toStructuredText("preserve-whitespace").asJSON());
const lines = json.blocks.flatMap((b: any) => b.lines ?? []).filter((l: any) => (l.text ?? "").trim().length > 3);

// 3 行ぶんをまたぐ、少しずれた矩形を引く
const sel = lines.slice(1, 4);
const x0 = Math.min(...sel.map((l: any) => l.bbox.x));
const y0 = Math.min(...sel.map((l: any) => l.bbox.y));
const x1 = Math.max(...sel.map((l: any) => l.bbox.x + l.bbox.w));
const y1 = Math.max(...sel.map((l: any) => l.bbox.y + l.bbox.h));
const area: Area = { page: 0, x: x0 - 2, y: y0 - 3, w: (x1 - x0) * 0.7, h: y1 - y0 + 5 };

console.log("囲んだ行:");
for (const l of sel) console.log(`   "${l.text.trim().slice(0, 40)}"`);
console.log(`矩形: x=${area.x.toFixed(0)} y=${area.y.toFixed(0)} w=${area.w.toFixed(0)} h=${area.h.toFixed(0)}\n`);

const r = redact(src, [area]);

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

check("削除内容を採取できた", r.removed.length > 0, `${r.removed.length} 件`);
check("検証が通る", r.verified, `stillReadable=${r.stillReadable.length} 件 verdict=${r.report.verdict}`);
if (r.stillReadable.length) {
  for (const t of r.stillReadable) console.log(`      残存: "${t.trim().slice(0, 40)}"`);
}

// 囲んだ中身が本当に消えているか
const after = mupdf.PDFDocument.openDocument(r.pdf, "application/pdf");
const afterText = JSON.parse(after.loadPage(0).toStructuredText("preserve-whitespace").asJSON())
  .blocks.flatMap((b: any) => (b.lines ?? []).map((l: any) => l.text)).join("\n");

const gone = sel.every((l: any) => !afterText.includes(l.text));
check("囲んだ行が消えている", gone);

// 消しすぎていないか（ページに他のテキストが残っている）
check("ページの他のテキストは残る", afterText.trim().length > 0,
  `残り ${afterText.trim().length} 文字`);
check("孤児オブジェクトなし", r.report.orphans.length === 0);

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
