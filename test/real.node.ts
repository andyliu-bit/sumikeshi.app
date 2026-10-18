// 実データでの誤検知率チェック。
// 対象は公開されている政府資料（本来「危険」であってはならない）。
// ここで大量に検出が出るなら、それは漏洩ではなくアルゴリズムの誤検知。
//
// 中身は公開文書だが不要に出力しない。判定に必要な範囲（長さと冒頭）だけ表示する。
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as mupdf from "mupdf";
import { createAnalyzer } from "../lib/analyze.ts";

const analyze = createAnalyzer(mupdf);
const dir = "samples-real";

// samples-real/ は gitignore 対象（公開資料を再配布しないため）。
// 手元に無い場合は README の手順で取得する。
if (!existsSync(dir)) {
  console.error(`${dir}/ がありません。公開されている PDF を置いてから実行してください。`);
  process.exit(1);
}

for (const name of readdirSync(dir).filter((f) => f.endsWith(".pdf"))) {
  const path = join(dir, name);
  const size = statSync(path).size;
  const t0 = Date.now();
  let r;
  try {
    r = analyze(readFileSync(path));
  } catch (e) {
    console.log(`\n■ ${name}\n   ERROR: ${e instanceof Error ? e.message : e}`);
    continue;
  }
  const ms = Date.now() - t0;

  console.log(`\n■ ${name}  (${(size / 1024).toFixed(0)}KB, ${r.pageCount}ページ, ${ms}ms)`);
  console.log(`   判定: ${r.verdict}`);
  console.log(`   隠しテキスト: ${r.hiddenText.length} 件`);

  // 誤検知の傾向を見るため、検出された行の特徴だけ出す
  const sample = r.hiddenText.slice(0, 6);
  for (const h of sample) {
    const head = h.text.slice(0, 24).replace(/\s+/g, " ");
    console.log(`      p${h.page + 1} contrast=${h.contrast} len=${h.text.length} "${head}${h.text.length > 24 ? "…" : ""}"`);
  }
  if (r.hiddenText.length > sample.length) {
    console.log(`      … 他 ${r.hiddenText.length - sample.length} 件`);
  }
  console.log(`   孤児オブジェクト: ${r.orphans.length} 件`);
  for (const o of r.orphans.slice(0, 3)) {
    console.log(`      obj${o.objNum} ${o.bytes}B textOps=${o.textOps}`);
  }
  console.log(`   メタデータ: ${r.metadata.map((m) => m.key).join(", ") || "なし"}`);
}
