// 履歴書・名刺のような「見出しとしての氏名」「区切りのない電話番号」を含む文書の検出。
//
// 日本の公文書だけを想定した規則では、この形式は素通りしてしまう。
// 実際の利用者が最初に投げてくるのはこの種の文書である可能性が高い。
import { readFileSync, writeFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createDetector } from "../lib/detect.ts";

const detect = createDetector(mupdf);

const ttc = readFileSync("C:/Windows/Fonts/msgothic.ttc");
const font = new mupdf.Font("MS-Gothic", ttc, 0);
const gid = (ch: string) => font.encodeCharacter(ch.codePointAt(0)!).toString(16).padStart(4, "0");
const hex = (s: string) => [...s].map(gid).join("");

// 実際の履歴書を模した構成（すべて架空のデータ）。氏名は見出しで、ラベルが付いていない。
const LINES: [string, number][] = [
  ["王小明", 20],
  ["電話：13800138000　邮箱：wang.xiaoming@example.com", 11],
  ["", 11],
  ["教育経歴", 14],
  ["架空情報大学　人工知能 修士　2025年04月 - 至今", 11],
  ["架空工業大学　人工知能 学士　2020年09月 - 2024年06月　GPA: 3.6/4", 11],
  ["所属獎項：全国大学生数学建模比賽 入賞（2022）、校奨学金（2021, 2022, 2023）", 11],
  ["", 11],
  ["職務経歴", 14],
  ["架空信息科技有限公司　2023年12月 - 2024年05月", 11],
  ["連絡先：080-1234-5678", 11],
  ["受付番号 20260827001　交付額 1234567 円", 11],
];

const doc = new mupdf.PDFDocument();
const fontRef = doc.addFont(font);
let contents = "";
let y = 780;
for (const [line, size] of LINES) {
  if (line) contents += `BT /F1 ${size} Tf 60 ${y} Td <${hex(line)}> Tj ET\n`;
  y -= size * 2.1;
}
const res = doc.addObject({ Font: { F1: fontRef } });
doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, res, contents));
const pdf = doc.saveToBuffer("compress").asUint8Array();
writeFileSync("samples-real/resume.pdf", pdf);

const { candidates: found } = detect(pdf);
console.log(`検出 ${found.length} 件`);
for (const c of found) console.log(`   [${c.label}] "${c.text}"`);

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const texts = found.map((c) => c.text);
const has = (s: string) => texts.some((t) => t.includes(s));

console.log();
check("見出しの氏名を検出", has("王小明"));
check("区切り無しの携帯番号を検出（11桁）", has("13800138000"));
check("メールアドレスを検出", has("wang.xiaoming@example.com"));
check("日本式の電話番号も検出", has("080-1234-5678"));
console.log();
check("受付番号を誤検出しない", !has("20260827001"));
check("金額を誤検出しない", !texts.some((t) => t.trim() === "1234567"));
check("大学名を誤検出しない", !has("架空工業大学"));
check("GPA を誤検出しない", !has("3.6"));

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
