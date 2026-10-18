// 診断ロジックを Node 上で検証する。
// spike で作った PDF を「期待される検出結果が分かっているサンプル」として使う。
import { readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { createAnalyzer, type Report } from "../lib/analyze.ts";

const analyze = createAnalyzer(mupdf);

type Case = {
  file: string;
  note: string;
  expect: {
    hidden: number;
    orphans: number;
    meta: "some" | "none";
    verdict: Report["verdict"];
    /** 孤児から復元される文字列に含まれるべき語 */
    recovered?: string;
  };
};

const CASES: Case[] = [
  {
    file: "spike/jp-bad.pdf",
    note: "日本語・黒矩形で覆っただけ",
    expect: { hidden: 1, orphans: 0, meta: "none", verdict: "danger" },
  },
  {
    file: "spike/bad-redaction.pdf",
    note: "Latin・黒矩形＋メタデータ有り",
    expect: { hidden: 1, orphans: 0, meta: "some", verdict: "danger" },
  },
  {
    file: "spike/redacted-nogc.pdf",
    note: "墨消し済みだが gc 無し保存（孤児が残る）",
    expect: { hidden: 0, orphans: 1, meta: "none", verdict: "danger", recovered: "山田太郎" },
  },
  {
    file: "spike/redacted-gc.pdf",
    note: "墨消し＋gc 有り保存（正しい処理）",
    expect: { hidden: 0, orphans: 0, meta: "none", verdict: "clean" },
  },
];

let failed = 0;

for (const c of CASES) {
  const r = analyze(readFileSync(c.file));
  const metaKind = r.metadata.length > 0 ? "some" : "none";

  const allRecovered = r.orphans.flatMap((o) => o.recovered).join("\n");
  // 復元は「本文ではなく、消えたはずの行だけ」が出ることまで確かめる。
  // 全文を返してしまうと通常の本文に埋もれて診断として役に立たない。
  const recoveredOk = c.expect.recovered
    ? allRecovered.includes(c.expect.recovered) && !allRecovered.includes("令和8年度 公開資料")
    : true;

  const ok =
    r.hiddenText.length === c.expect.hidden &&
    r.orphans.length === c.expect.orphans &&
    metaKind === c.expect.meta &&
    r.verdict === c.expect.verdict &&
    recoveredOk;
  if (!ok) failed++;

  console.log(`\n${ok ? "PASS" : "FAIL"}  ${c.file}  — ${c.note}`);
  console.log(`   verdict : ${r.verdict}  (期待 ${c.expect.verdict})`);
  console.log(`   隠しテキスト: ${r.hiddenText.length} 件 (期待 ${c.expect.hidden})`);
  for (const h of r.hiddenText) {
    console.log(`      p${h.page + 1} contrast=${h.contrast} "${h.text}"`);
  }
  console.log(`   孤児オブジェクト: ${r.orphans.length} 件 (期待 ${c.expect.orphans})`);
  for (const o of r.orphans) {
    console.log(`      obj${o.objNum} ${o.bytes}B textOps=${o.textOps}`);
    for (const t of o.recovered) console.log(`        復元: "${t}"`);
  }
  if (c.expect.recovered && !recoveredOk) {
    console.log(`      ← 復元が期待通りでない（"${c.expect.recovered}" のみを含むべき）`);
  }
  console.log(`   メタデータ: ${r.metadata.length} 件 (期待 ${c.expect.meta})`);
  for (const m of r.metadata) console.log(`      ${m.key} = ${JSON.stringify(m.value)}`);
}

console.log(`\n${"═".repeat(50)}`);
console.log(failed === 0 ? `全 ${CASES.length} ケース PASS` : `${failed}/${CASES.length} ケース FAIL`);
process.exit(failed === 0 ? 0 : 1);
