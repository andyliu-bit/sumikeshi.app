// 04 の残留検証は無効だった（Flate 圧縮されたストリームを生バイトで検索していたため、
// 未処理ファイルでさえ「残留なし」と出る = 判別力ゼロ）。
// ここでは全オブジェクトのストリームを解凍してから検索し、まず対照実験で検出力を確認する。
import * as mupdf from "mupdf";
import { readFileSync } from "node:fs";

const PAGE_H = 842;
const BOX = { x: 50, y: 694, w: 330, h: 24 };
const rect = [BOX.x, PAGE_H - (BOX.y + BOX.h), BOX.x + BOX.w, PAGE_H - BOX.y];

const ttc = readFileSync("C:/Windows/Fonts/msgothic.ttc");
const probeFont = new mupdf.Font("MS-Gothic", ttc, 0);
const gidHex = (s) =>
  [...s].map((c) => probeFont.encodeCharacter(c.codePointAt(0)).toString(16).padStart(4, "0")).join("");
const SECRET_GIDS = gidHex("山田太郎").toLowerCase();
console.log("検索対象 glyph 列 (山田太郎):", SECRET_GIDS, "\n");

// 全オブジェクトのストリームを解凍して検索する。
// content stream 内の文字列は <hex> 形式にも (literal) 形式にも直列化されうるので両方を探す。
const SECRET_HEXTEXT = Buffer.from(SECRET_GIDS, "latin1");   // "14a323..." という文字列として
const SECRET_RAWBYTES = Buffer.from(SECRET_GIDS, "hex");      // 0x14 0xa3 0x23... という生バイトとして

function deepResidue(bytes) {
  const d = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  const n = d.countObjects();
  let hits = [];
  for (let i = 1; i < n; i++) {
    // isStream()/readStream() は間接参照に対して呼ぶ（resolve() 後だと常に false）
    const ref = d.newIndirect(i);
    if (!ref.isStream()) continue;
    for (const [kind, read] of [["decoded", "readStream"], ["raw", "readRawStream"]]) {
      const b = Buffer.from(ref[read]().asUint8Array());
      if (b.includes(SECRET_RAWBYTES)) { hits.push(`obj${i}:${kind}:bytes`); break; }
      if (b.toString("latin1").toLowerCase().includes(SECRET_GIDS)) { hits.push(`obj${i}:${kind}:hex`); break; }
    }
  }
  return { hits, total: n };
}

function redactedBuffer(saveOpt) {
  const d = mupdf.PDFDocument.openDocument(readFileSync("jp-bad.pdf"), "application/pdf");
  const p = d.loadPage(0);
  const a = p.createAnnotation("Redact");
  a.setRect(rect);
  p.update();
  p.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_REMOVE,
    mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
  return Buffer.from(d.saveToBuffer(saveOpt).asUint8Array());
}

// ── 対照実験：未処理ファイルで検出できるか ────────────
const control = deepResidue(readFileSync("jp-bad.pdf"));
console.log("═══ 対照実験（未処理 jp-bad.pdf）═══");
console.log(`  オブジェクト数: ${control.total}`);
console.log(`  glyph 列を含むストリーム: obj ${JSON.stringify(control.hits)}`);
console.log(`  検出力: ${control.hits.length > 0 ? "OK ← この方法は残留を検出できる" : "NG ← 検出できない。テスト自体が無効"}\n`);

if (control.hits.length === 0) {
  console.log("対照実験に失敗したため、以降の結果は信用できない。");
  process.exit(1);
}

// ── 本番：保存方式ごとの残留 ─────────────────────────
console.log("═══ 墨消し後・保存方式ごとの残留 ═══");
const variants = ["incremental", "", "compress", "compress,garbage=compact", "compress,garbage=deduplicate"];
let allClean = true;
for (const opt of variants) {
  let buf;
  try { buf = redactedBuffer(opt); }
  catch (e) { console.log(`  ${(opt || "(なし)").padEnd(30)} : ERROR ${e.message}`); continue; }
  const r = deepResidue(buf);
  const bad = r.hits.length > 0;
  if (bad) allClean = false;
  console.log(`  ${(opt || "(なし)").padEnd(30)} : ${bad ? `残留 YES ← 危険 obj${JSON.stringify(r.hits)}` : "残留 no  ← OK"}  (${buf.length} bytes)`);
}
console.log(`\n  判定: ${allClean ? "全保存方式でストリーム内に残留なし" : "一部の保存方式で原本が残る ← full rewrite 必須"}`);
