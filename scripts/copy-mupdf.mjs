// mupdf はバンドルせず public/mupdf/ から実行時に読み込むため、dist をコピーする。
// dev / build の前に自動実行される（predev / prebuild）。
//
// バージョン付きのディレクトリに置く理由:
// ファイル名が固定だと CDN に長期キャッシュさせられない（新旧の js と wasm が
// 食い違うと壊れる）。パスにバージョンを入れておけば、上げた瞬間に URL が変わり
// キャッシュも自然に切り替わるので、1年 immutable で配信できる（public/_headers）。
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "mupdf");
const src = join(pkgDir, "dist");

const FILES = ["mupdf.js", "mupdf-wasm.js", "mupdf-wasm.wasm"];

if (!existsSync(src)) {
  console.error("mupdf が見つかりません。npm install を実行してください。");
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;

// 古いバージョンのディレクトリが残ると out/ に混ざって配信されるので作り直す
const base = join(root, "public", "mupdf");
rmSync(base, { recursive: true, force: true });

const dst = join(base, version);
mkdirSync(dst, { recursive: true });
for (const f of FILES) copyFileSync(join(src, f), join(dst, f));

// worker が読み込むパスを組み立てるための定数
writeFileSync(
  join(root, "lib", "mupdf-version.ts"),
  [
    "// 自動生成: scripts/copy-mupdf.mjs",
    "// 手で編集しない。node_modules の mupdf のバージョンに追従する。",
    `export const MUPDF_VERSION = ${JSON.stringify(version)};`,
    "",
  ].join("\n"),
);

console.log(`mupdf ${version} を public/mupdf/${version}/ にコピーしました (${FILES.length} ファイル)`);
