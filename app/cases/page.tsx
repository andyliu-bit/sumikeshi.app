import type { Metadata } from "next";
import Link from "@/lib/link.tsx";
import { CASES } from "@/content/cases.ts";

export const metadata: Metadata = {
  title: "PDF黒塗り漏えい事例まとめ — なぜ同じ事故が繰り返されるのか",
  description:
    "PDF の黒塗り処理の不備による個人情報漏えいの公表事例をまとめています。自治体・大学で同じ構造の事故が繰り返し起きている理由と、自分の組織で確認する方法。",
};

export default function CasesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        PDF黒塗り漏えい事例
      </h1>
      <p className="mt-5 text-base leading-relaxed text-muted">
        黒塗りの不備による個人情報漏えいは、特定の組織の不注意ではなく、
        <strong className="font-semibold text-ink">
          PDF の仕組みに由来する構造的な問題
        </strong>
        として繰り返し起きています。ここでは公表された事案を、再発防止の観点から整理します。
      </p>

      <section className="mt-10 rounded-lg bg-bg p-6 border border-line">
        <h2 className="text-lg font-bold text-ink">なぜ起きるのか</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          紙の書類にマジックで塗れば、その下の文字は物理的に消えます。
          しかし PDF で黒い四角形を重ねても、それは
          <strong className="font-semibold text-ink">文字の上に図形を一枚置いただけ</strong>
          で、文字データはファイルの中に残ったままです。
          コピー＆ペースト、全文検索、テキスト抽出のいずれでも読み取れてしまいます。
        </p>
        <p className="mt-3 text-base leading-relaxed text-muted">
          画面上は完全に隠れて見えるため、作成者にも決裁者にも異常が見えません。
          これが「確認したのに漏れる」構造です。
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold text-ink">公表された事案</h2>
        <p className="mt-2 text-sm text-muted">
          一次情報または報道で確認できたものを掲載しています。
        </p>

        <div className="mt-6 space-y-6">
          {CASES.map((c) => (
            <article key={c.id} className="rounded-lg bg-bg p-6 border border-line">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-bold text-ink">{c.org}</h3>
                <span className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                  {c.orgType}
                </span>
                <span className="text-sm text-muted">{c.published} 公表</span>
              </div>

              <p className="mt-3 text-base font-medium leading-relaxed text-ink">
                {c.summary}
              </p>
              <p className="mt-2.5 text-base leading-relaxed text-muted">{c.detail}</p>

              <dl className="mt-4 rounded-lg bg-surface px-4 py-3">
                <dt className="text-xs font-semibold text-muted">技術的な原因</dt>
                <dd className="mt-1 text-sm text-ink">{c.cause}</dd>
              </dl>

              <ul className="mt-4 space-y-1">
                {c.sources.map((s) => (
                  <li key={s.url} className="text-sm">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted underline underline-offset-2 hover:text-ink"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-lg bg-bg p-6 border border-line">
        <h2 className="text-lg font-bold text-ink">事例に共通する点</h2>
        <ul className="mt-4 space-y-3 text-base leading-relaxed text-muted">
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
            <span>
              <strong className="font-semibold text-ink">作成時の確認では見つかっていない。</strong>
              経緯が公表されている事案では、閲覧者や請求者側からの指摘、または他の事案を受けた自主点検で判明している。
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
            <span>
              <strong className="font-semibold text-ink">作成側は気づけない。</strong>
              公開・提供した後も画面上は正常に見えるため、閲覧者に指摘されるまで分からない。
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
            <span>
              <strong className="font-semibold text-ink">
                個人の注意力だけでは防げない。
              </strong>
              「黒く塗る」作業自体は行われている。PDF への変換方法やファイルの取り違えなど、
              手順のどこか一か所で塗った下の情報が残り、しかも画面上では区別がつかない。
            </span>
          </li>
        </ul>
      </section>

      <div className="mt-12 rounded-lg bg-ink p-6 text-white">
        <h2 className="text-lg font-bold">手元のファイルを確認する</h2>
        <p className="mt-2 text-base leading-relaxed text-white/75">
          公開済み・提出済みの PDF が同じ状態になっていないか、その場で診断できます。
          ファイルはブラウザ内だけで処理され、サーバーには送信されません。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md bg-bg px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface"
          >
            PDF を診断する
          </Link>
          <Link
            href="/guide"
            className="rounded-md px-5 py-2.5 text-sm font-medium text-white/75 border border-white/25 hover:bg-white/10"
          >
            自己点検の手順を見る
          </Link>
        </div>
      </div>
    </div>
  );
}
