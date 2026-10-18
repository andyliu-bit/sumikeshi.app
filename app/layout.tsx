import type { Metadata } from "next";
import Link from "@/lib/link.tsx";
import { SITE } from "@/lib/site.ts";
import "./globals.css";

const DESCRIPTION =
  "PDFの黒塗りが本当に効いているかを診断します。黒枠の下に残ったテキスト層、削除済みのはずの原本、メタデータを検出。ファイルはブラウザ内で処理され、サーバーには送信されません。";

/** `node scripts/make-og.mjs` で生成する。文言を変えたら再生成すること。 */
const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "黒塗りの下から「氏名：山田太郎 電話：090-1234-5678」が読み取れている図",
} as const;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "その黒塗り、実は読めています — PDF墨消しチェッカー",
    template: `%s — ${SITE.name}`,
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: SITE.name,
    title: "その黒塗り、実は読めています",
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE.url, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt }],
  },
  twitter: {
    card: "summary_large_image",
    title: "その黒塗り、実は読めています",
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

const NAV = [
  { href: "/", label: "診断" },
  { href: "/redact", label: "墨消し" },
  { href: "/batch", label: "一括診断" },
  { href: "/cases", label: "事例" },
  { href: "/guide", label: "手順" },
  { href: "/pricing", label: "料金" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="flex min-h-screen flex-col bg-bg text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          本文へスキップ
        </a>

        <header className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-[2px]">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-5">
            <Link href="/" className="shrink-0 text-sm font-bold tracking-tight text-ink">
              PDF墨消しチェッカー
            </Link>
            <nav aria-label="メイン" className="flex items-center gap-1 overflow-x-auto">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded-sm px-2.5 py-1.5 text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="mt-20 border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl px-5 py-10">
            <div className="flex flex-wrap gap-x-8 gap-y-6">
              <div className="min-w-[200px]">
                <p className="text-sm font-bold text-ink">PDF墨消しチェッカー</p>
                <p className="prose-width mt-2 text-sm leading-relaxed text-muted">
                  すべての処理は利用者のブラウザ内で行われます。
                  アップロードされたファイルがサーバーに送信されることはありません。
                </p>
              </div>
              <nav aria-label="フッター" className="flex gap-x-10 text-sm">
                <ul className="space-y-2">
                  {NAV.map((n) => (
                    <li key={n.href}>
                      <Link href={n.href} className="text-muted hover:text-ink">
                        {n.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-2">
                  <li>
                    <Link href="/terms" className="text-muted hover:text-ink">
                      利用規約
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacy" className="text-muted hover:text-ink">
                      プライバシーポリシー
                    </Link>
                  </li>
                  <li>
                    <Link href="/license" className="text-muted hover:text-ink">
                      ライセンス
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="text-muted hover:text-ink">
                      お問い合わせ
                    </Link>
                  </li>
                  <li>
                    {/* 解析エンジンの mupdf が AGPL-3.0 のため、本体も同じ条件でソースを公開している */}
                    <a href="https://github.com/andyliu-bit/sumikeshi.app" className="text-muted hover:text-ink">
                      ソースコード（AGPL-3.0）
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
