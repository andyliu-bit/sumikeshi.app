import type { Metadata } from "next";
import { Fragment } from "react";
import { PURCHASE_URL } from "@/lib/site.ts";
import { Badge, ButtonLink } from "@/components/ui.tsx";

export const metadata: Metadata = {
  title: "料金",
  description:
    "診断と墨消しは無料で全機能を利用できます。複数ファイルの一括診断と、処理報告書への組織名・決裁欄の記載は買い切りライセンス（¥3,800・販売準備中）で解放されます。月額課金はありません。",
};

type Cell = boolean | string;
type Row = { label: string; free: Cell; buyout: Cell; org: Cell };

const FEATURES: { group: string; rows: Row[] }[] = [
  {
    group: "診断",
    rows: [
      { label: "黒塗りの下に残ったテキストの検出", free: true, buyout: true, org: true },
      { label: "孤児オブジェクト（削除前の原本）の検出", free: true, buyout: true, org: true },
      { label: "メタデータ・埋め込みファイルの検出", free: true, buyout: true, org: true },
      { label: "複数ファイルの一括診断・CSV 書き出し", free: false, buyout: true, org: true },
    ],
  },
  {
    group: "墨消し",
    rows: [
      { label: "範囲を指定して削除", free: true, buyout: true, org: true },
      {
        label: "個人情報の自動検出（電話・郵便番号・メール・個人番号・記入欄）",
        free: true,
        buyout: true,
        org: true,
      },
      { label: "処理後の自動検証", free: true, buyout: true, org: true },
      { label: "処理報告書の出力", free: true, buyout: true, org: true },
      { label: "報告書への組織名・決裁欄の記載", free: false, buyout: true, org: true },
    ],
  },
  {
    group: "組織での利用",
    rows: [
      { label: "利用範囲", free: "1名", buyout: "1名", org: "5名〜" },
      { label: "請求書払い（銀行振込・年度予算）", free: false, buyout: false, org: true },
      { label: "見積書・納品書の発行", free: false, buyout: false, org: true },
      { label: "内部規程・手順書のひな形", free: false, buyout: false, org: "開発中" },
    ],
  },
];

const PLANS = [
  {
    id: "free",
    name: "無料",
    price: "¥0",
    unit: "",
    for: "個人・単発の確認",
    note: "登録不要。診断も墨消しも制限なく使えます。",
    featured: false,
    cta: { label: "診断をはじめる", href: "/", variant: "secondary" as const, external: false },
  },
  {
    id: "buyout",
    name: "買い切り",
    price: "¥3,800",
    unit: "／買い切り",
    for: "士業・中小企業・部門単位",
    note: "月額ではありません。一度の購入で以後ずっと使えます。",
    featured: true,
    cta: PURCHASE_URL
      ? { label: "購入する", href: PURCHASE_URL, variant: "primary" as const, external: true }
      : { label: "販売準備中・連絡を受け取る", href: "/contact", variant: "secondary" as const, external: false },
  },
  {
    id: "org",
    name: "組織",
    price: "別途見積",
    unit: "",
    for: "自治体・大学・法務部門",
    note: "請求書払いに対応します。年度予算での導入が可能です。",
    featured: false,
    cta: { label: "見積りを依頼する", href: "/contact", variant: "secondary" as const, external: false },
  },
];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="prose-width">
        <h1 className="text-2xl font-bold tracking-tight text-ink">料金</h1>
        <p className="mt-4 leading-relaxed text-muted">
          診断と墨消しは無料で全機能を提供します。公開前の確認は誰でも無条件にできるべきで、
          そこに料金をかけると確認されない文書が増えるためです。
          有料で提供するのは、まとめて処理する機能と、組織で使うための機能です。
        </p>
      </div>

      <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col p-6 ${p.featured ? "bg-primary-soft" : "bg-bg"}`}
          >
            <div className="flex items-baseline gap-2">
              <h2 className="font-bold text-ink">{p.name}</h2>
              {p.featured && (
                <Badge tone="ok" mark={false}>
                  おすすめ
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">{p.for}</p>
            <p className="mt-4 flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight text-ink">{p.price}</span>
              <span className="text-sm text-muted">{p.unit}</span>
            </p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.note}</p>
            <ButtonLink
              href={p.cta.href}
              variant={p.cta.variant}
              className="mt-5 w-full"
              {...(p.cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {p.cta.label}
            </ButtonLink>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">
        表示価格は税別です。買い切りライセンスに更新料や年会費はありません。
        既に無料で提供している機能を、後から有料へ移すことはしません。
      </p>

      <section className="mt-14">
        <h2 className="text-xl font-bold text-ink">機能の比較</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                <th scope="col" className="py-3 text-left font-semibold text-ink">
                  機能
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    scope="col"
                    className="w-28 py-3 text-center font-semibold text-ink"
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((g) => (
                <Fragment key={g.group}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={4}
                      className="border-b border-line bg-surface px-3 py-2 text-left text-xs font-bold text-muted"
                    >
                      {g.group}
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-b border-line">
                      <th scope="row" className="py-3 pr-4 text-left font-normal text-ink">
                        {r.label}
                      </th>
                      <Val v={r.free} />
                      <Val v={r.buyout} />
                      <Val v={r.org} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="text-xl font-bold text-ink">よくあるご質問</h2>
        <dl className="mt-5 space-y-6">
          <Faq
            q="無料プランに機能制限や透かしはありますか"
            a="ありません。処理後の PDF に透かしは入りません。正式な文書に使えないツールでは意味がないためです。診断 3 項目、墨消し、個人情報の自動検出、処理報告書まで無料で利用できます。"
          />
          <Faq
            q="買い切りとありますが、本当に月額はかかりませんか"
            a="かかりません。更新料も年会費もありません。購入後にライセンスキーをお送りしますので、ブラウザに登録してお使いください。"
          />
          <Faq
            q="アカウント登録は必要ですか"
            a="不要です。ライセンスキーは署名付きの文字列で、確認はブラウザ内だけで完結します。認証のための通信が発生しないため、外部と通信できない庁内ネットワークでも動作します。"
          />
          <Faq
            q="ファイルはどこで処理されますか"
            a="すべてお使いのブラウザ内で処理されます。ファイルがサーバーに送信されることはありません。ライセンスの有無で変わりません。"
          />
          <Faq
            q="なぜ一括での墨消しは無いのですか"
            a="削除する範囲の判断は人が行う必要があるためです。消し漏らしは漏えい事故ですが、消しすぎも情報公開請求への不当な不開示になります。一括で行えるのは診断、つまりどのファイルに問題があるかの洗い出しまでとしています。"
          />
          <Faq
            q="請求書払いに対応していますか"
            a="組織プランで対応します。見積書の発行、銀行振込、年度予算での購入が可能です。お問い合わせからご相談ください。"
          />
        </dl>
      </section>

      <div className="mt-12 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-6">
        <div className="prose-width">
          <p className="font-bold text-ink">組織での導入を検討される場合</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            セキュリティ要件の確認や試用について個別にご相談を承ります。
            端末内で処理が完結する仕組みについての説明資料もお出しできます。
          </p>
        </div>
        <ButtonLink href="/contact" variant="primary" className="ml-auto">
          相談する
        </ButtonLink>
      </div>
    </div>
  );
}

function Val({ v }: { v: Cell }) {
  if (v === true)
    return (
      <td className="py-3 text-center">
        <span className="sr-only">対応</span>
        <span aria-hidden className="font-bold text-primary">
          ✓
        </span>
      </td>
    );
  if (v === false)
    return (
      <td className="py-3 text-center">
        <span className="sr-only">非対応</span>
        <span aria-hidden className="text-line-strong">
          —
        </span>
      </td>
    );
  if (v === "開発中")
    return (
      <td className="py-3 text-center">
        <Badge tone="neutral" mark={false}>
          開発中
        </Badge>
      </td>
    );
  return <td className="py-3 text-center text-ink">{v}</td>;
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-bold text-ink">{q}</dt>
      <dd className="prose-width mt-1.5 leading-relaxed text-muted">{a}</dd>
    </div>
  );
}
