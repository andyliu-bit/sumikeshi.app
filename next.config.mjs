/** @type {import('next').NextConfig} */
const nextConfig = {
  // 完全な静的書き出し。サーバーを持たない設計なので API も middleware も無く、
  // out/ をそのまま静的ホスティング（Cloudflare Pages 等）に置ける。
  output: "export",
  // Next 16 は Turbopack が既定。webpack 設定を書くと競合して起動できない。
  // mupdf の Node 用 `await import("module")` は、バンドル自体をさせない方針
  // （worker で turbopackIgnore 付き動的 import）で回避しているため別名解決は不要。
  turbopack: {},
  // 生成物でリポジトリを汚さない
  agentRules: false,
};

export default nextConfig;
