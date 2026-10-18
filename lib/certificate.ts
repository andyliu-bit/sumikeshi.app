// 処理報告書。監査・決裁・保管のための記録。
//
// 設計上の原則: **削除した内容そのものは絶対に載せない。**
// 報告書は回覧され保管されるため、中身を書けば報告書自体が新たな漏洩源になる。
// 記録するのは「どこを」「何文字」「いつ」「どのファイルに対して」までで、
// ファイルの同一性は SHA-256 で担保する。
import type { AreaStat } from "./redact.ts";
import type { Report } from "./analyze.ts";

export const TOOL_NAME = "PDF墨消しツール";
export const TOOL_VERSION = "0.1.0";

export type FileFacts = { name: string; bytes: number; sha256: string };

/** ライセンス保有時のみ報告書に印字する。稟議・決裁に回す際に必要になる */
export type Licensee = { org: string; plan: string };

export type Certificate = {
  tool: { name: string; version: string };
  processedAt: string;
  source: FileFacts;
  output: FileFacts;
  areaStats: AreaStat[];
  licensee?: Licensee;
  verification: {
    areaReExtraction: boolean;
    orphanObjects: number;
    metadata: number;
    embeddedFiles: number;
    passed: boolean;
  };
};

export async function sha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildCertificate(args: {
  source: FileFacts;
  output: FileFacts;
  areaStats: AreaStat[];
  report: Report;
  stillReadable: string[];
  licensee?: Licensee;
}): Certificate {
  const { source, output, areaStats, report, stillReadable, licensee } = args;
  const verification = {
    areaReExtraction: stillReadable.length === 0,
    orphanObjects: report.orphans.length,
    metadata: report.metadata.length,
    embeddedFiles: report.embeddedFiles.length,
    passed:
      stillReadable.length === 0 &&
      report.orphans.length === 0 &&
      report.metadata.length === 0,
  };
  return {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    processedAt: new Date().toISOString(),
    source,
    output,
    areaStats,
    licensee,
    verification,
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtSize = (n: number) =>
  n < 1024 ? `${n} バイト` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

/** 単体で保存・印刷できる自己完結 HTML を返す */
export function renderCertificateHtml(c: Certificate): string {
  const v = c.verification;
  const row = (label: string, ok: boolean, value: string) => `
    <tr>
      <td class="mark ${ok ? "ok" : "ng"}">${ok ? "✓" : "✕"}</td>
      <td>${esc(label)}</td>
      <td class="val">${esc(value)}</td>
    </tr>`;

  const areas = c.areaStats
    .map(
      (s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${s.area.page + 1}</td>
      <td class="num">${Math.round(s.area.x)}, ${Math.round(s.area.y)}</td>
      <td class="num">${Math.round(s.area.w)} × ${Math.round(s.area.h)}</td>
      <td class="num">${s.charCount}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>墨消し処理報告書 — ${esc(c.source.name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
    color: #111; line-height: 1.7; margin: 0 auto; padding: 32px 28px; max-width: 760px;
    font-size: 13.5px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: .02em; }
  .sub { color: #555; font-size: 12px; margin-bottom: 22px; }
  h2 { font-size: 14px; margin: 26px 0 8px; padding-bottom: 5px; border-bottom: 1.5px solid #111; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; font-weight: 600; white-space: nowrap; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .k { width: 130px; color: #555; white-space: nowrap; }
  .hash { font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; word-break: break-all; color: #333; }
  .mark { width: 24px; font-weight: 700; text-align: center; }
  .ok { color: #047857; }
  .ng { color: #b91c1c; }
  td.val { text-align: right; white-space: nowrap; }
  .verdict {
    margin: 10px 0 0; padding: 10px 14px; border-radius: 4px; font-weight: 700;
    border: 1.5px solid; font-size: 14px;
  }
  .verdict.pass { background: #ecfdf5; border-color: #047857; color: #065f46; }
  .verdict.fail { background: #fef2f2; border-color: #b91c1c; color: #991b1b; }
  .note { margin-top: 26px; padding: 12px 14px; background: #fafafa; border: 1px solid #e4e4e7; font-size: 11.5px; color: #444; }
  .note ul { margin: 6px 0 0; padding-left: 18px; }
  .note li { margin: 3px 0; }
  footer { margin-top: 22px; font-size: 11px; color: #777; }
  table.org { width: auto; margin: -12px 0 22px; }
  table.org td { border: none; padding: 2px 8px 2px 0; }
  table.org td.k { color: #555; }
  table.seal { width: auto; margin-top: 8px; border: 1px solid #111; }
  table.seal th, table.seal td { border: 1px solid #111; text-align: center; padding: 4px 6px; }
  table.seal th { background: #f4f4f5; font-size: 11.5px; font-weight: 600; }
  table.seal td { height: 54px; width: 84px; }
  .sealnote { margin-top: 6px; font-size: 11px; color: #555; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style>
</head>
<body>

<h1>墨消し処理報告書</h1>
<div class="sub">${esc(c.tool.name)} v${esc(c.tool.version)} ／ 作成日時 ${fmtDate(c.processedAt)}</div>
${c.licensee ? `<table class="org"><tr><td class="k">作成組織</td><td><strong>${esc(c.licensee.org)}</strong></td></tr></table>` : ""}

<h2>処理対象ファイル</h2>
<table>
  <tr><td class="k">処理前ファイル名</td><td>${esc(c.source.name)}</td></tr>
  <tr><td class="k">サイズ</td><td>${fmtSize(c.source.bytes)}</td></tr>
  <tr><td class="k">SHA-256</td><td class="hash">${esc(c.source.sha256)}</td></tr>
  <tr><td class="k">処理後ファイル名</td><td>${esc(c.output.name)}</td></tr>
  <tr><td class="k">サイズ</td><td>${fmtSize(c.output.bytes)}</td></tr>
  <tr><td class="k">SHA-256</td><td class="hash">${esc(c.output.sha256)}</td></tr>
</table>

<h2>削除箇所（${c.areaStats.length} 件）</h2>
<table>
  <thead>
    <tr><th>#</th><th>ページ</th><th class="num">位置 (x, y)</th><th class="num">範囲 (幅 × 高)</th><th class="num">削除文字数</th></tr>
  </thead>
  <tbody>${areas}</tbody>
</table>

<h2>検証結果</h2>
<table>
  ${row("削除領域からのテキスト再抽出", v.areaReExtraction, v.areaReExtraction ? "文字なし" : "残存あり")}
  ${row("孤児オブジェクト（削除前の原本）", v.orphanObjects === 0, v.orphanObjects === 0 ? "なし" : `${v.orphanObjects} 件`)}
  ${row("メタデータ", v.metadata === 0, v.metadata === 0 ? "除去済み" : `${v.metadata} 件`)}
  ${row("埋め込みファイル", v.embeddedFiles === 0, v.embeddedFiles === 0 ? "なし" : `${v.embeddedFiles} 件`)}
</table>
<p class="verdict ${v.passed ? "pass" : "fail"}">
  ${v.passed ? "全項目で問題は検出されませんでした。" : "未処理の項目があります。処理後ファイルは公開しないでください。"}
</p>

<div class="note">
  <strong>本報告書について</strong>
  <ul>
    <li>本報告書には、削除された内容そのものは記載していません。記録するのは位置と文字数のみです。</li>
    <li>処理はすべて利用者の端末内（ブラウザ）で行われ、ファイルは外部に送信されていません。</li>
    <li>SHA-256 は処理前後のファイルの同一性を確認するための値です。</li>
    <li>本ツールは画像内の文字（スキャン文書）を判定対象としていません。また、埋め込みフォントのサブセットには削除された文字の字形が残る場合があります。</li>
  </ul>
</div>

${c.licensee ? `
<h2>確認・決裁</h2>
<table class="seal">
  <tr><th>担当</th><th>係長</th><th>課長</th></tr>
  <tr><td></td><td></td><td></td></tr>
</table>
<p class="sealnote">本報告書は上記の処理結果を記録したものです。内容を確認のうえ押印してください。</p>
` : ""}

<footer>${esc(c.tool.name)} v${esc(c.tool.version)}　—　この報告書はブラウザの印刷機能から PDF として保存できます。</footer>

</body>
</html>`;
}
