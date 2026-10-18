// 縦書き文書での実漏洩を検出できるか。
// 縦書きでは mupdf が 1 文字ずつ独立した line を返すため、
// 「誤検知を消す修正が、縦書きの本物の漏洩まで消していないか」を確認する。
// 日本の公文書は縦書きが多いのでここは落とせない。
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync } from "node:fs";
import { createAnalyzer } from "../lib/analyze.ts";

const PAGE_W = 595, PAGE_H = 842;
const SECRET = "山田太郎";
const PUBLIC = "公開部分";

const ttc = readFileSync("C:/Windows/Fonts/msgothic.ttc");
const font = new mupdf.Font("MS-Gothic", ttc, 0);
const gid = (ch: string) => font.encodeCharacter(ch.codePointAt(0)!).toString(16).padStart(4, "0");

const doc = new mupdf.PDFDocument();
const fontRef = doc.addFont(font);
const SIZE = 14;

// 縦書き: 1 文字ずつ下方向に配置する
let contents = "";
const colX = 500;
let y = 700;
for (const ch of SECRET) {
  contents += `BT /F1 ${SIZE} Tf ${colX} ${y} Td <${gid(ch)}> Tj ET\n`;
  y -= SIZE;
}
// 別の列に公開テキスト（こちらは隠さない）
let y2 = 700;
for (const ch of PUBLIC) {
  contents += `BT /F1 ${SIZE} Tf 450 ${y2} Td <${gid(ch)}> Tj ET\n`;
  y2 -= SIZE;
}
// 秘密の列だけを黒く塗り潰す。
// ベースライン基準で上端(ascent)と下端(descent)まで完全に覆う必要がある。
// 少しでもはみ出すとその文字はコントラストを持ち、検出対象から外れる。
const top = 700 + SIZE;
const bottom = 700 - SIZE * (SECRET.length - 1) - SIZE * 0.4;
const box = { x: colX - 3, y: bottom, w: SIZE + 6, h: top - bottom };
contents += `0 0 0 rg ${box.x} ${box.y} ${box.w} ${box.h} re f\n`;

const resources = doc.addObject({ Font: { F1: fontRef } });
doc.insertPage(-1, doc.addPage([0, 0, PAGE_W, PAGE_H], 0, resources, contents));
writeFileSync("samples-real/vertical-bad.pdf", doc.saveToBuffer("compress").asUint8Array());

const analyze = createAnalyzer(mupdf);
const r = analyze(readFileSync("samples-real/vertical-bad.pdf"));

console.log("縦書きサンプル（1列を黒塗り、隣の列は公開）");
console.log(`  判定: ${r.verdict}`);
console.log(`  隠しテキスト: ${r.hiddenText.length} 件`);
for (const h of r.hiddenText) {
  console.log(`     contrast=${h.contrast} bbox=(${h.bbox.x},${h.bbox.y}) "${h.text}"`);
}

const found = r.hiddenText.map((h) => h.text).join("");
const detectedAll = [...SECRET].every((ch) => found.includes(ch));
const noFalsePositive = ![...PUBLIC].some((ch) => found.includes(ch));

const merged = r.hiddenText.length === 1 && r.hiddenText[0].text === SECRET;

console.log(`\n  秘密の文字を全て検出: ${detectedAll ? "YES ← OK" : "NO ← 漏れ"}`);
console.log(`  公開部分を誤検出しない: ${noFalsePositive ? "YES ← OK" : "NO ← 誤検知"}`);
console.log(`  1件に連結されている  : ${merged ? `YES ← OK ("${r.hiddenText[0].text}")` : `NO ← ${r.hiddenText.length} 件のまま`}`);
process.exit(detectedAll && noFalsePositive && merged ? 0 : 1);
