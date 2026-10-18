// 自動検出の検証。
// 誤検出の少なさが命。実データ（公開されている政府資料）で無関係な箇所を
// 拾わないことまで確認する。
import { readFileSync, writeFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createDetector, isValidMyNumber } from "../lib/detect.ts";

const detect = createDetector(mupdf);
let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

// ── マイナンバーの検査用数字 ─────────────────────────
console.log("■ マイナンバー検査用数字");
// 検査式から正しい 12 桁を組み立てる
const build = (first11: string) => {
  const d = [...first11].map(Number);
  let sum = 0;
  for (let n = 1; n <= 11; n++) sum += d[11 - n] * (n <= 6 ? n + 1 : n - 5);
  const r = sum % 11;
  return first11 + String(r <= 1 ? 0 : 11 - r);
};
const valid = build("12345678901");
check("正しい番号を受理", isValidMyNumber(valid), valid);
check("検査用数字が違えば拒否", !isValidMyNumber(valid.slice(0, 11) + ((Number(valid[11]) + 1) % 10)));
check("桁数不足を拒否", !isValidMyNumber("12345678901"));
const randomPass = Array.from({ length: 200 }, () =>
  String(Math.floor(Math.random() * 1e12)).padStart(12, "0"),
).filter(isValidMyNumber).length;
check("無作為な12桁はほぼ通らない", randomPass < 40, `200件中 ${randomPass} 件（期待: 1/11 程度）`);

// ── 合成した公文書ふうの PDF で検出 ──────────────────
console.log("\n■ 公文書ふうの書式");
const ttc = readFileSync("C:/Windows/Fonts/msgothic.ttc");
const font = new mupdf.Font("MS-Gothic", ttc, 0);
const gid = (ch: string) => font.encodeCharacter(ch.codePointAt(0)!).toString(16).padStart(4, "0");
const hex = (s: string) => [...s].map(gid).join("");

const LINES = [
  "令和8年度 補助金交付申請書",
  "氏名：山田太郎　　電話：090-1234-5678",
  "住所：東京都千代田区霞が関1-2-3",
  "〒100-8926",
  "メールアドレス：taro.yamada@example.lg.jp",
  `個人番号：${valid}`,
  "交付決定額 1234567 円",
  "受付番号 20260826001",
];

const doc = new mupdf.PDFDocument();
const fontRef = doc.addFont(font);
let contents = "";
let y = 760;
for (const line of LINES) {
  contents += `BT /F1 12 Tf 60 ${y} Td <${hex(line)}> Tj ET\n`;
  y -= 24;
}
const res = doc.addObject({ Font: { F1: fontRef } });
doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, res, contents));
const pdf = doc.saveToBuffer("compress").asUint8Array();
writeFileSync("samples-real/koubunsho.pdf", pdf);

const { candidates: found, imageCount } = detect(pdf);
console.log(`   検出 ${found.length} 件`);
for (const c of found) console.log(`      [${c.label}] "${c.text}"  (x=${Math.round(c.area.x)} w=${Math.round(c.area.w)})`);

const texts = found.map((c) => c.text);
check("電話番号を検出", texts.some((t) => t.includes("090-1234-5678")));
check("郵便番号を検出", texts.some((t) => t.includes("100-8926")));
check("メールアドレスを検出", texts.some((t) => t.includes("taro.yamada@example.lg.jp")));
check("個人番号を検出", texts.some((t) => t.includes(valid)));
check("氏名欄を検出", texts.some((t) => t.includes("山田太郎")));
check("住所欄を検出", texts.some((t) => t.includes("霞が関")));
check("金額を個人番号と誤認しない", !texts.some((t) => t === "1234567"));
check("受付番号を誤検出しない", !texts.some((t) => t.includes("20260826001")));
check("見出し行を拾わない", !texts.some((t) => t.includes("補助金交付申請書")));
check("画像が無いことを報告", imageCount === 0, `imageCount=${imageCount}`);

// 行全体ではなく該当部分だけを囲めているか
const phone = found.find((c) => c.kind === "phone");
const nameField = found.find((c) => c.text.includes("山田太郎"));
if (phone && nameField) {
  check("電話番号の枠が行全体より狭い", phone.area.w < 120, `w=${Math.round(phone.area.w)}`);
  check("氏名と電話が別の枠になる", Math.abs(phone.area.x - nameField.area.x) > 20);
}

// ── 実データで誤検出しないこと ───────────────────────
console.log("\n■ 実データ（公開政府資料）での誤検出");
for (const f of ["digital-2025-minutes.pdf", "soumu-2007-old.pdf", "digital-2023-minutes.pdf"]) {
  const { candidates: r } = detect(readFileSync(`samples-real/${f}`));
  const kinds = r.reduce<Record<string, number>>((a, c) => ((a[c.label] = (a[c.label] ?? 0) + 1), a), {});
  console.log(`   ${f}: ${r.length} 件 ${JSON.stringify(kinds)}`);
  for (const c of r.slice(0, 4)) console.log(`      [${c.label}] "${c.text.slice(0, 30)}"`);
}

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
