// out/ を静的ホスティングと同じ条件で配信する。デプロイ前の確認用。
//
// dev サーバーとは配信条件が違う（MIME、拡張子の補完、圧縮）ため、
// 特に WASM と Worker はここで一度確かめてから本番に出す。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PORT = Number(process.argv[2] ?? 3001);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  // これを取り違えると WebAssembly.instantiateStreaming が失敗する
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

/** 静的ホスティングと同じく、拡張子なしのパスは .html / index.html を補う */
async function resolve(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const base = join(ROOT, rel);
  const candidates = pathname.endsWith("/")
    ? [join(base, "index.html"), base.replace(/[/\\]$/, "") + ".html"]
    : [base, base + ".html", join(base, "index.html")];
  for (const c of candidates) {
    try {
      if ((await stat(c)).isFile()) return c;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const file = (await resolve(pathname)) ?? join(ROOT, "404.html");
  try {
    const body = await readFile(file);
    res.writeHead(file.endsWith("404.html") ? 404 : 200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, () => {
  console.log(`out/ を配信中: http://localhost:${PORT}`);
});
