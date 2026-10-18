// メタデータ文字列の復号を検証する。
// 符号化の推定は「たまたま例外が出なかった」と「正しく読めた」の区別が付きにくいので、
// 期待する文字列まで突き合わせる。
import { existsSync, readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createAnalyzer, decodePdfString } from "../lib/analyze.ts";

let failed = 0;
const check = (name: string, actual: string, expect: string) => {
  const ok = actual === expect;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        期待: ${JSON.stringify(expect)}`);
    console.log(`        実際: ${JSON.stringify(actual)}`);
  }
};

const toHex = (bytes: number[]) =>
  "<" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("") + ">";
const utf8 = (s: string) => toHex([...new TextEncoder().encode(s)]);

console.log("── 単体 ──");

// 総務省 2007年の資料に実在した値（BOM 無し Shift_JIS）
const SOUMU =
  "<4D6963726F736F667420576F7264202D208E9197BF8250817C824F8253814089EF8B63939982CC8CF68A4A82C982C282A282C4816988C4816A2E646F63>";
check(
  "BOM 無し Shift_JIS（実データ）",
  decodePdfString(SOUMU),
  "Microsoft Word - 資料１－０４　会議等の公開について（案）.doc",
);

// UTF-16BE + BOM
check(
  "UTF-16BE (BOM 付き)",
  decodePdfString(toHex([0xfe, 0xff, 0x30, 0xc6, 0x30, 0xb9, 0x30, 0xc8])),
  "テスト",
);

check("ASCII のみ", decodePdfString("<48656c6c6f>"), "Hello");
check("UTF-8", decodePdfString(utf8("議事録")), "議事録");

// hex 形式でないものは触らない
check("通常の文字列はそのまま", decodePdfString("第9回 議事録"), "第9回 議事録");
check("空文字はそのまま", decodePdfString(""), "");
// 復号できないものは推測で壊さず元の値を返す
check("奇数長の hex はそのまま", decodePdfString("<4d696>"), "<4d696>");

// UTF-8 を Shift_JIS より先に試さないと、UTF-8 の日本語が文字化けして通ってしまう。
// 「議事録」の UTF-8 バイト列を Shift_JIS として読むと別の文字列になる。
const utf8Ja = utf8("議事録");
const asSjis = new TextDecoder("shift_jis").decode(
  Uint8Array.from(new TextEncoder().encode("議事録")),
);
console.log(`        （順序の根拠: 同じバイト列を Shift_JIS で読むと ${JSON.stringify(asSjis)}）`);
check("符号化の判定順序", decodePdfString(utf8Ja), "議事録");

// ── 実ファイル ──────────────────────────────────────────
const REAL = "samples-real/soumu-2007-old.pdf";
if (existsSync(REAL)) {
  console.log("\n── 実ファイル ──");
  const report = createAnalyzer(mupdf)(readFileSync(REAL));
  const title = report.metadata.find((m) => m.key === "Title");
  if (!title) {
    console.log("FAIL  Title が検出されなかった");
    failed++;
  } else {
    const ok = !title.value.startsWith("<") && title.value.includes("会議等の公開について");
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${REAL} の Title が復号されている`);
    console.log(`        ${title.value}`);
  }
} else {
  console.log(`\n（${REAL} が無いため実ファイル検証はスキップ）`);
}

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
