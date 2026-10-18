"use client";

import { useMemo, useState } from "react";
import { OPERATOR } from "@/lib/site.ts";
import { Button, Note, Panel } from "@/components/ui.tsx";

const KINDS = [
  { id: "quote", label: "見積りの依頼" },
  { id: "trial", label: "評価用キーの依頼" },
  { id: "intro", label: "組織での導入相談" },
  { id: "notify", label: "機能提供開始の連絡希望" },
  { id: "other", label: "その他" },
] as const;

export default function Contact() {
  const [kind, setKind] = useState<string>(KINDS[0].id);
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [seats, setSeats] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  const kindLabel = KINDS.find((k) => k.id === kind)?.label ?? "";

  const message = useMemo(() => {
    const lines = [
      `【種別】${kindLabel}`,
      `【組織名】${org || "（未記入）"}`,
      `【お名前】${name || "（未記入）"}`,
      `【メールアドレス】${email || "（未記入）"}`,
    ];
    if (kind === "quote" || kind === "intro") {
      lines.push(`【想定利用人数】${seats || "（未記入）"}`);
    }
    lines.push("", "【ご相談内容】", body || "（未記入）");
    return lines.join("\n");
  }, [kind, kindLabel, org, name, email, seats, body]);

  const mailto = `mailto:${OPERATOR.email}?subject=${encodeURIComponent(
    `【PDF墨消しチェッカー】${kindLabel}`,
  )}&body=${encodeURIComponent(message)}`;

  // mailto: の URL 長は環境によって 2000 文字前後で頭打ちになる。
  // 超えるとメールソフト側で本文が切れるので、その場合はコピーを促す。
  const tooLongForMailto = mailto.length > 1800;

  const copy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink">お問い合わせ</h1>
      <p className="prose-width mt-4 leading-relaxed text-muted">
        見積りのご依頼、組織での導入相談を承ります。請求書払い、年度予算での購入にも対応します。
      </p>

      <Note>
        当サイトはフォームの送信を受け付けるサーバーを持ちません。以下は入力内容から
        メール本文を組み立てるだけの画面で、内容が当方に自動送信されることはありません。
        メールソフトで開くか、本文をコピーして送信してください。
      </Note>

      <form className="mt-8 space-y-6" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">お問い合わせの種別</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k.id}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-sm transition-colors duration-150 ${
                  kind === k.id
                    ? "border-primary bg-primary-soft text-ink"
                    : "border-line bg-bg text-muted hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.id}
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                  className="accent-[oklch(0.38_0.095_162)]"
                />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="組織名" value={org} onChange={setOrg} placeholder="◯◯市 総務課" />
          <Field label="お名前" value={name} onChange={setName} placeholder="山田 太郎" />
        </div>

        <Field
          label="メールアドレス"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="example@city.example.lg.jp"
        />

        {(kind === "quote" || kind === "intro") && (
          <Field
            label="想定利用人数"
            value={seats}
            onChange={setSeats}
            placeholder="5名程度"
          />
        )}

        <div>
          <label htmlFor="body" className="text-sm font-semibold text-ink">
            ご相談内容
          </label>
          <textarea
            id="body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="ご利用予定の場面、確認したい要件、ご希望の開始時期など"
            className="mt-1.5 w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-base leading-relaxed text-ink placeholder:text-muted/70 focus:border-accent"
          />
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-semibold text-ink">送信内容</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-anywhere rounded-md border border-line bg-bg p-3.5 font-mono text-sm leading-relaxed text-ink">
            {message}
          </pre>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={tooLongForMailto ? "secondary" : "primary"}
              disabled={tooLongForMailto}
              onClick={() => {
                window.location.href = mailto;
              }}
            >
              メールソフトで開く
            </Button>
            <Button type="button" onClick={copy}>
              {copied ? "コピーしました" : "本文をコピー"}
            </Button>
            <p className="text-sm text-muted">
              宛先: <span className="break-anywhere font-mono text-ink">{OPERATOR.email}</span>
            </p>
          </div>
          {tooLongForMailto && (
            <p className="mt-3 text-sm text-muted">
              内容が長いためメールソフトでは本文が途中で切れる可能性があります。
              「本文をコピー」から貼り付けて送信してください。
            </p>
          )}
        </div>
      </form>

      <Panel className="mt-10">
        <h2 className="font-bold text-ink">組織での採用をご検討の場合</h2>
        <p className="prose-width mt-2 text-sm leading-relaxed text-muted">
          セキュリティ要件の確認のため、本ツールが端末内で処理を完結させる仕組みについての
          説明資料をお出しできます。情報システム部門の審査に必要な情報があれば、あわせて
          お知らせください。
        </p>
      </Panel>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = `f-${label}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full rounded-md border border-line bg-bg px-3.5 text-base text-ink placeholder:text-muted/70 focus:border-accent"
      />
    </div>
  );
}
