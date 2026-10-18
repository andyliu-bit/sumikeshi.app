// 処理報告書の検証。
// 最重要は「報告書に削除内容が載っていないこと」。報告書は回覧・保管されるので、
// ここが破れると報告書自体が新たな漏洩源になる。
import { readFileSync, writeFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createRedactor, type Area } from "../lib/redact.ts";
import { createAnalyzer } from "../lib/analyze.ts";
import { buildCertificate, renderCertificateHtml, sha256 } from "../lib/certificate.ts";

const redact = createRedactor(mupdf);
const analyze = createAnalyzer(mupdf);

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const SECRETS = ["山田太郎", "090-1234-5678", "氏名"];

const src = readFileSync("spike/jp-bad.pdf");
const pre = analyze(src);
const areas: Area[] = pre.hiddenText.map((h) => ({ page: h.page, ...h.bbox }));
const r = redact(src, areas);

const sourceSha = await sha256(src);
const outputSha = await sha256(r.pdf);

const cert = buildCertificate({
  source: { name: "公開資料_令和8年度.pdf", bytes: src.byteLength, sha256: sourceSha },
  output: { name: "公開資料_令和8年度_墨消し済み.pdf", bytes: r.pdf.byteLength, sha256: outputSha },
  areaStats: r.areaStats,
  report: r.report,
  stillReadable: r.stillReadable,
});
const html = renderCertificateHtml(cert);
writeFileSync("samples-real/certificate-sample.html", html);

console.log(`削除された内容（画面表示用）: ${r.removed.map((t) => `"${t.trim()}"`).join(", ")}\n`);

// ── 最重要: 報告書に中身が漏れていないこと ──
const leaked = SECRETS.filter((s) => html.includes(s));
check("報告書に削除内容が含まれない", leaked.length === 0,
  leaked.length ? `漏洩: ${leaked.join(", ")}` : "");

// ── 監査に必要な情報が揃っていること ──
check("SHA-256（処理前）を記載", html.includes(sourceSha), sourceSha.slice(0, 16) + "…");
check("SHA-256（処理後）を記載", html.includes(outputSha), outputSha.slice(0, 16) + "…");
check("ハッシュが 64 桁", sourceSha.length === 64 && outputSha.length === 64);
check("処理前後でハッシュが異なる", sourceSha !== outputSha);
check("削除箇所数が一致", cert.areaStats.length === areas.length, `${cert.areaStats.length} 件`);
check("削除文字数を記録", cert.areaStats.every((s) => s.charCount > 0),
  cert.areaStats.map((s) => `${s.charCount}文字`).join(", "));
check("検証結果が合格", cert.verification.passed);
check("ファイル名を記載", html.includes("公開資料_令和8年度.pdf"));
check("自己完結 HTML", html.startsWith("<!DOCTYPE html>") && html.includes("</html>"));
check("印刷用スタイルあり", html.includes("@page") && html.includes("@media print"));
check("免責・注記あり", html.includes("スキャン文書") && html.includes("サブセット"));

// ── 失敗ケースでも正しく「不合格」と出ること ──
const bad = buildCertificate({
  source: { name: "x.pdf", bytes: 1, sha256: "a" },
  output: { name: "y.pdf", bytes: 1, sha256: "b" },
  areaStats: [],
  report: { ...r.report, orphans: [{ objNum: 10, bytes: 200, textOps: 2, recovered: [] }] },
  stillReadable: [],
});
check("孤児が残れば不合格になる", bad.verification.passed === false);
check("不合格時は警告文を出す",
  renderCertificateHtml(bad).includes("公開しないでください"));

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
console.log("サンプル: samples-real/certificate-sample.html");
process.exit(failed === 0 ? 0 : 1);
