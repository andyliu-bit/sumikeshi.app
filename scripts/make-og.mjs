// OGP 画像（1200x630）を生成する。文言を変えたら再実行して public/og.png を更新する。
//
// Satori（next/og）を使わない理由: 日本語フォントを別途読ませる必要があり、
// 静的書き出しの構成では割に合わない。mupdf は既に依存にあり、
// システムの日本語フォントをそのまま埋め込める。
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";

const W = 1200, H = 630;

// ── DESIGN.md の oklch トークンを sRGB に変換する ──────────
function oklch(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, v));
  });
}

const INK = oklch(0.22, 0.012, 160);
const MUTED = oklch(0.50, 0.008, 160);
const PRIMARY = oklch(0.38, 0.095, 162);
// 黒地に載せる danger。DESIGN.md の値（L=0.50）は白地用で、
// 黒地では対比 2.6:1 しか出ず OGP の縮小表示で読めない。明度だけ上げる。
const DANGER_ON_DARK = oklch(0.68, 0.17, 25);
const WHITE = [1, 1, 1];

const rg = (c) => `${c[0].toFixed(4)} ${c[1].toFixed(4)} ${c[2].toFixed(4)} rg`;

// ── フォント ────────────────────────────────────────────
const BOLD_PATH = "C:/Windows/Fonts/YuGothB.ttc";
const REG_PATH = "C:/Windows/Fonts/YuGothR.ttc";
for (const p of [BOLD_PATH, REG_PATH]) {
  if (!existsSync(p)) {
    console.error(`フォントが見つかりません: ${p}`);
    process.exit(1);
  }
}
const bold = new mupdf.Font("YuGothic-Bold", readFileSync(BOLD_PATH), 0);
const reg = new mupdf.Font("YuGothic", readFileSync(REG_PATH), 0);

const doc = new mupdf.PDFDocument();
const fonts = { B: doc.addFont(bold), R: doc.addFont(reg) };
const faces = { B: bold, R: reg };

const hex = (face, s) =>
  [...s].map((c) => face.encodeCharacter(c.codePointAt(0)).toString(16).padStart(4, "0")).join("");

/** advanceGlyph は em 比なので字号を掛けると実幅になる */
const width = (face, s, size) =>
  [...s].reduce((w, c) => w + face.advanceGlyph(face.encodeCharacter(c.codePointAt(0))), 0) * size;

const ops = [];
/** yTop は上端からの距離。PDF 座標へ変換して積む */
const text = (fontKey, size, x, yTop, s, color) => {
  ops.push(`${rg(color)} BT /${fontKey} ${size} Tf ${x} ${H - yTop} Td <${hex(faces[fontKey], s)}> Tj ET`);
};
const rect = (x, yTop, w, h, color) =>
  ops.push(`${rg(color)} ${x} ${H - yTop - h} ${w} ${h} re f`);

// ── レイアウト ──────────────────────────────────────────
const M = 72;

rect(0, 0, W, H, WHITE);
// 上端の細い帯。ブランド色を状態色と競合させずに置ける唯一の場所
rect(0, 0, W, 8, PRIMARY);

// 上段は「何のツールか」と「どこで処理されるか」。下段は状態の図解。
text("R", 25, M, 108, "PDF墨消しチェッカー", MUTED);
const claim = "ブラウザ内だけで処理・アップロード不要";
text("R", 25, W - M - width(faces.R, claim, 25), 108, claim, MUTED);

text("B", 88, M, 226, "その黒塗り、", INK);
text("B", 88, M, 336, "実は読めています。", INK);

// 黒塗りの下から個人情報が読める、という状態をそのまま図にする
const BAR_Y = 402, BAR_H = 92;
rect(M, BAR_Y, W - M * 2, BAR_H, INK);
const leak = "氏名：山田太郎　電話：090-1234-5678";
text("R", 36, M + 36, BAR_Y + 60, leak, DANGER_ON_DARK);

text("R", 26, M, BAR_Y + BAR_H + 58, "コピー＆ペーストで、そのまま読み取れます", MUTED);

// ── 出力 ────────────────────────────────────────────────
const page = doc.addPage([0, 0, W, H], 0, doc.addObject({ Font: fonts }), ops.join("\n"));
doc.insertPage(-1, page);

const pdfBytes = doc.saveToBuffer("compress").asUint8Array();
const rendered = mupdf.PDFDocument.openDocument(pdfBytes, "application/pdf");
const pg = rendered.loadPage(0);
const pix = pg.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false, true);
writeFileSync("public/og.png", pix.asPNG());

console.log(`public/og.png を生成しました (${pix.getWidth()}x${pix.getHeight()})`);
