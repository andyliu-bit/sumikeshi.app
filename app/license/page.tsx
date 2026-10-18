"use client";

import { useState } from "react";
import Link from "@/lib/link.tsx";
import { useLicense } from "@/lib/use-license.ts";
import { PLAN_LABEL } from "@/lib/license.ts";
import { PURCHASE_URL } from "@/lib/site.ts";
import { Badge, Button, ButtonLink, Panel } from "@/components/ui.tsx";

export default function LicensePage() {
  const { license, loading, activate, deactivate } = useLicense();
  const [input, setInput] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "invalid">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setState("checking");
    const ok = await activate(input);
    if (ok) {
      setInput("");
      setState("idle");
    } else {
      setState("invalid");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink">ライセンス</h1>
      <p className="prose-width mt-4 leading-relaxed text-muted">
        ライセンスはこの端末のブラウザに保存され、外部に送信されません。
        認証のための通信は発生しないため、外部と通信できない環境でも利用できます。
      </p>

      {loading ? (
        <div className="mt-8 h-24 animate-pulse rounded-lg border border-line bg-surface" />
      ) : license ? (
        <Panel tone="ok" className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="ok">有効</Badge>
            <span className="font-bold text-ink">{license.org}</span>
            <span className="text-sm text-muted">
              {PLAN_LABEL[license.plan]}
              {license.plan === "org" && ` / ${license.seats}席`}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            この組織名は処理報告書に「作成組織」として印字されます。
            発行日 {license.issuedAt}。
          </p>
          <Button size="sm" className="mt-4" onClick={deactivate}>
            この端末から削除
          </Button>
        </Panel>
      ) : (
        <>
          <form onSubmit={submit} className="mt-8">
            <label htmlFor="key" className="text-sm font-semibold text-ink">
              ライセンスキー
            </label>
            <textarea
              id="key"
              rows={3}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setState("idle");
              }}
              placeholder="SUMI1-…"
              spellCheck={false}
              className="mt-1.5 w-full rounded-md border border-line bg-bg px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-muted/70 focus:border-accent"
            />
            {state === "invalid" && (
              <p className="mt-2 text-sm text-danger">
                このキーは確認できませんでした。前後の空白を含めて、お送りしたキーをそのまま貼り付けてください。
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              className="mt-3"
              disabled={!input.trim() || state === "checking"}
              loading={state === "checking"}
            >
              有効にする
            </Button>
          </form>

          <div className="mt-10 rounded-lg border border-line bg-surface p-6">
            <h2 className="font-bold text-ink">ライセンスをお持ちでない場合</h2>
            <p className="prose-width mt-2 text-sm leading-relaxed text-muted">
              診断と単一ファイルの墨消しは、ライセンスなしで全て無料で利用できます。
              ライセンスで解放されるのは、複数ファイルの一括処理と、処理報告書への組織名・担当者名の記載です。
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {PURCHASE_URL ? (
                <ButtonLink href={PURCHASE_URL} variant="primary" target="_blank" rel="noopener noreferrer">
                  買い切りライセンスを購入
                </ButtonLink>
              ) : (
                <span className="rounded-md border border-line bg-bg px-4 py-2.5 text-sm text-muted">
                  販売準備中です
                </span>
              )}
              <ButtonLink href="/pricing">料金の詳細</ButtonLink>
              <ButtonLink href="/contact" variant="ghost">
                組織での導入を相談
              </ButtonLink>
            </div>
          </div>
        </>
      )}

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="text-xl font-bold text-ink">よくあるご質問</h2>
        <dl className="mt-5 space-y-5">
          <Faq
            q="複数の端末で使えますか"
            a="買い切りライセンスは購入者ご本人の利用端末でお使いいただけます。組織ライセンスは席数の範囲内で、同じキーを各端末に登録して利用します。"
          />
          <Faq
            q="ブラウザのデータを消すとどうなりますか"
            a="キーの再入力が必要になります。購入時のメールは保管してください。紛失した場合は購入時の情報をお知らせいただければ再送します。"
          />
          <Faq
            q="組織名は変更できますか"
            a="ライセンスに組織名が刻まれているため、変更には再発行が必要です。お問い合わせからご連絡ください。"
          />
          <Faq
            q="オフラインでも使えますか"
            a="ライセンスの確認は端末内で完結し、通信は発生しません。ただし解析エンジンはファイルを選んだときに読み込むため、インターネットに接続していない状態では動作しません。"
          />
        </dl>
      </section>

      <p className="mt-10 text-sm text-muted">
        ご不明な点は
        <Link href="/contact" className="mx-1 text-accent underline underline-offset-2">
          お問い合わせ
        </Link>
        からご連絡ください。
      </p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-bold text-ink">{q}</dt>
      <dd className="prose-width mt-1.5 leading-relaxed text-muted">{a}</dd>
    </div>
  );
}
