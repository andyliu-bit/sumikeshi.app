// トップの「サンプル PDF で試す」用の PDF を作る → public/demo/sample-kuronuri.pdf
// 手元の PDF は機密を含むことが多く、試すために出すのをためらう。架空の PDF で結果を先に見せる。
//
// 3 種類の残り方を全部入れる:
//   1. 黒い四角を重ねただけの行（テキスト層が残る）
//   2. 墨消し後に gc 無しで保存（旧 content stream が孤児として残る）
//   3. 架空の作成者名（メタデータ）
// 標準 14 書体だけで作るので数 KB に収まる（日本語フォントを埋め込むと MB 単位になる）。
//   node scripts/make-sample.mjs
import * as mupdf from "mupdf";
import { mkdirSync, writeFileSync } from "node:fs";
import { createAnalyzer } from "../lib/analyze.ts";

const OUT = "public/demo/sample-kuronuri.pdf";
const H = 842;
const HIDDEN = "Name: Sample Taro (fictional)   Tel: 000-0000-0000";
const REDACTED = "Address: 1-2-3 Example-cho, Sample City (fictional)";

const doc = new mupdf.PDFDocument();
const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
const res = doc.addObject({ Font: { F1: font } });
const contents = `
BT /F1 18 Tf 50 760 Td (SAMPLE: Public notice - all data below is fictional) Tj ET
BT /F1 12 Tf 50 700 Td (${HIDDEN}) Tj ET
0 0 0 rg 45 692 420 22 re f
BT /F1 12 Tf 50 650 Td (${REDACTED}) Tj ET
BT /F1 12 Tf 50 600 Td (This file is a demo for sumikeshi.app.) Tj ET
`;
doc.insertPage(-1, doc.addPage([0, 0, 595, H], 0, res, contents));
doc.setMetaData("info:Author", "Sample Hanako (fictional)");
doc.setMetaData("info:Title", "C:/Users/sample/Desktop/naibu-shiryo.docx");
const first = Uint8Array.from(doc.saveToBuffer("compress").asUint8Array());

// 3 行目を正しく墨消しするが、gc を付けずに保存する（よくある実装ミス）
const d2 = mupdf.PDFDocument.openDocument(first, "application/pdf");
const page = d2.loadPage(0);
const annot = page.createAnnotation("Redact");
annot.setRect([45, H - 668, 500, H - 644]);
page.update();
page.applyRedactions(
  true,
  mupdf.PDFPage.REDACT_IMAGE_REMOVE,
  mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
  mupdf.PDFPage.REDACT_TEXT_REMOVE,
);
const out = Uint8Array.from(d2.saveToBuffer("compress").asUint8Array());

mkdirSync("public/demo", { recursive: true });
writeFileSync(OUT, out);

// 自己検査: 3 種類とも検出され、復元行が表示されること
const r = createAnalyzer(mupdf)(out);
const checks = [
  ["判定が危険", r.verdict === "danger"],
  ["黒塗りの下の行を検出", r.hiddenText.some((h) => h.text.includes("000-0000-0000"))],
  ["孤児から墨消し済みの行を復元", r.orphans.some((o) => o.recovered.includes(REDACTED))],
  ["作成者名を検出", r.metadata.some((m) => m.key === "Author")],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
console.log(`${OUT} (${out.length} bytes)`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
