// 05 の残留が「ページから参照されなくなった旧 content stream（孤児オブジェクト）」
// であることを確定させる。テキスト抽出では安全に見えるのに原本が残る、という
// 最も見つけにくい事故パターンなので、性質をはっきりさせておく。
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync } from "node:fs";

const PAGE_H = 842;
const BOX = { x: 50, y: 694, w: 330, h: 24 };
const rect = [BOX.x, PAGE_H - (BOX.y + BOX.h), BOX.x + BOX.w, PAGE_H - BOX.y];
const SECRET_GIDS = "14a323e312b4347b";  // 「山田太郎」の glyph 列（05 で確認済み）

for (const opt of ["compress", "compress,garbage=deduplicate"]) {
  const d = mupdf.PDFDocument.openDocument(readFileSync("jp-bad.pdf"), "application/pdf");
  const p = d.loadPage(0);
  const a = p.createAnnotation("Redact");
  a.setRect(rect);
  p.update();
  p.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_REMOVE,
    mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
  const out = Buffer.from(d.saveToBuffer(opt).asUint8Array());
  const name = `redacted-${opt.includes("garbage") ? "gc" : "nogc"}.pdf`;
  writeFileSync(name, out);

  console.log(`\n══════ ${name}  (save: "${opt}") ══════`);

  const d2 = mupdf.PDFDocument.openDocument(out, "application/pdf");

  // 1) ページが実際に参照している content stream
  const pageObj = d2.findPage(0);
  const contentsRef = pageObj.get("Contents");
  const refNum = contentsRef.isIndirect() ? contentsRef.asIndirect() : null;
  const shown = Buffer.from(contentsRef.readStream().asUint8Array()).toString("latin1");
  console.log(`  ページが参照する Contents : obj ${refNum}`);
  console.log(`    SECRET を含む: ${shown.toLowerCase().includes(SECRET_GIDS) ? "YES" : "no"}`);
  console.log(`    抜粋: ${JSON.stringify(shown.replace(/\s+/g, " ").slice(0, 120))}`);

  // 2) ファイル内の全ストリームを走査し、SECRET を持つオブジェクトを列挙
  const n = d2.countObjects();
  const holders = [];
  for (let i = 1; i < n; i++) {
    const r = d2.newIndirect(i);
    if (!r.isStream()) continue;
    const b = Buffer.from(r.readStream().asUint8Array()).toString("latin1").toLowerCase();
    if (b.includes(SECRET_GIDS)) holders.push(i);
  }
  console.log(`  SECRET を含むオブジェクト : ${holders.length ? JSON.stringify(holders) : "なし"}`);
  const orphans = holders.filter((i) => i !== refNum);
  console.log(`  → うちページ非参照(孤児)  : ${orphans.length ? JSON.stringify(orphans) + "  ← 原本が残存" : "なし ← OK"}`);

  // 3) 通常のテキスト抽出では気づけないことを示す
  const json = JSON.parse(d2.loadPage(0).toStructuredText("preserve-whitespace").asJSON());
  const txt = (json.blocks ?? []).flatMap((b) => (b.lines ?? []).map((l) => l.text)).join(" ");
  console.log(`  テキスト抽出の見え方      : ${txt.includes("山田太郎") ? "個人情報あり" : "安全に見える"}  → "${txt.trim()}"`);
}
