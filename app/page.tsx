"use client";

import { useCallback, useRef, useState } from "react";
import Link from "@/lib/link.tsx";
import type { Report } from "@/lib/analyze.ts";
import { PdfWorker, checkFileSize } from "@/lib/client.ts";
import { Badge, Button, ButtonLink, Panel, Section, type Tone } from "@/components/ui.tsx";

type State =
  | { kind: "idle" }
  | { kind: "working"; name: string }
  | { kind: "done"; name: string; report: Report }
  | { kind: "error"; message: string };

export default function Page() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setState({ kind: "error", message: "PDF ファイルを選択してください。" });
      return;
    }
    const tooBig = checkFileSize(file.size);
    if (tooBig) {
      setState({ kind: "error", message: tooBig });
      return;
    }
    setState({ kind: "working", name: file.name });
    const worker = new PdfWorker();
    try {
      await worker.open(await file.arrayBuffer());
      const { report } = await worker.analyze();
      setState({ kind: "done", name: file.name, report });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error
            ? /パスワード/.test(err.message)
              ? err.message
              : `解析できませんでした（${err.message}）。パスワード保護された PDF や破損したファイルは対象外です。`
            : String(err),
      });
    } finally {
      worker.terminate();
    }
  }, []);

  const busy = state.kind === "working";

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="prose-width">
        <h1 className="text-3xl font-bold leading-[1.3] tracking-tight text-ink">
          その黒塗り、実は読めています。
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          黒い四角を重ねただけの PDF は、コピー＆ペーストで中身が読めます。
          墨消し処理をした PDF でも、保存の仕方によっては削除前の内容がファイル内に残り、画面にもコピーにも出てこないことがあります。
          このツールはその残り方も検出し、復元できた文字列はそのまま表示します。
        </p>
      </div>

      {/* ツールを最初に置く。利用者は締切直前に来るので、説明より先に使えること */}
      <div className="mt-8">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) run(f);
          }}
          className={`rounded-lg border border-dashed transition-colors duration-150 ${
            dragging ? "border-primary bg-primary-soft" : "border-line-strong bg-surface"
          }`}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 px-6 py-12 disabled:cursor-wait"
          >
            {busy ? (
              <>
                <span
                  aria-hidden
                  className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
                />
                <span className="text-md font-medium text-ink">解析中</span>
                <span className="text-sm text-muted">{state.name}</span>
              </>
            ) : (
              <>
                <span className="text-md font-medium text-ink">
                  PDF をドロップ、またはクリックして選択
                </span>
                <span className="text-sm text-muted">無料・登録不要。アップロードは発生しません</span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="text-primary">
              ●
            </span>
            ファイルはブラウザ内だけで処理され、サーバーには送信されません。
          </p>
          {/* 手元の PDF は機密を含むことが多く、試すために出すのをためらう。架空の PDF で結果を先に見せる */}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              const blob = await (await fetch("/demo/sample-kuronuri.pdf")).blob();
              run(new File([blob], "sample-kuronuri.pdf", { type: "application/pdf" }));
            }}
          >
            サンプル PDF で試す（架空のデータ）
          </Button>
        </div>
      </div>

      {state.kind === "error" && (
        <Panel tone="warn" className="mt-6">
          <p className="text-sm leading-relaxed text-ink">{state.message}</p>
        </Panel>
      )}

      {state.kind === "done" && <Result name={state.name} report={state.report} />}

      <Section
        title="診断する3項目"
        description="1 はコピー＆ペースト、3 の多くは PDF ビューアの［文書のプロパティ］や添付ファイルの一覧でも確認できます。2 は画面表示・コピー・全文検索・プロパティのどれにも現れないため、ファイルの内部を調べないと見つかりません。"
        className="mt-16"
      >
        <dl className="divide-y divide-line border-y border-line">
          <Item
            n="1"
            term="黒塗りの下に残ったテキスト"
            desc="画面では隠れていても、テキスト層が生きていればコピーや全文検索で読み取れます。"
          />
          <Item
            n="2"
            term="ファイル内に残った削除前の原本"
            desc="墨消し処理をしても保存方法によっては、削除前の内容がファイル内に丸ごと残ります。どのページからも参照されない孤児オブジェクトや、上書き保存（増分保存）で残る過去の版がそれで、表示にもテキスト抽出にも現れません。"
          />
          <Item
            n="3"
            term="メタデータ・埋め込みファイル"
            desc="作成者名、元のファイル名、元ファイルの保存パスが本文とは別に記録されていることがあります。"
          />
        </dl>

        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          <NavCard
            href="/cases"
            title="漏えい事例"
            desc="自治体・大学で公表された事案と、繰り返される理由"
          />
          <NavCard
            href="/guide"
            title="自己点検の手順"
            desc="公開前に確認する 3 ステップと、正しい隠し方"
          />
        </div>
      </Section>
    </div>
  );
}

function Item({ n, term, desc }: { n: string; term: string; desc: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[auto_1fr] sm:gap-x-4">
      <dt className="flex items-start gap-2.5 font-semibold text-ink sm:col-span-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-ink text-xs font-bold text-white">
          {n}
        </span>
        {term}
      </dt>
      <dd className="prose-width pl-7.5 text-sm leading-relaxed text-muted sm:col-span-2">
        {desc}
      </dd>
    </div>
  );
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="group bg-bg p-5 transition-colors duration-150 hover:bg-surface">
      <span className="flex items-center gap-1.5 font-bold text-ink">
        {title}
        <span
          aria-hidden
          className="text-muted transition-transform duration-150 group-hover:translate-x-0.5"
        >
          →
        </span>
      </span>
      <span className="mt-1 block text-sm leading-relaxed text-muted">{desc}</span>
    </Link>
  );
}

const VERDICT: Record<Report["verdict"], { label: string; tone: Tone; lead: string }> = {
  danger: {
    label: "危険",
    tone: "bad",
    lead: "このファイルは公開・提出できる状態ではありません。",
  },
  warning: {
    label: "注意",
    tone: "warn",
    lead: "付随情報が残っています。内容を確認してください。",
  },
  // 「問題なし」とは言わない。検出できない残り方（画像内の文字など）がある
  clean: { label: "検出なし", tone: "ok", lead: "3項目とも検出はありませんでした。" },
};

function Result({ name, report }: { name: string; report: Report }) {
  const v = VERDICT[report.verdict];
  return (
    <section aria-live="polite" className="mt-8">
      <Panel tone={v.tone}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone={v.tone}>{v.label}</Badge>
          <p className="font-semibold text-ink">{v.lead}</p>
          <p className="ml-auto text-sm text-muted">
            {name}（{report.pageCount}ページ）
          </p>
        </div>
      </Panel>

      {report.hiddenText.length > 0 && (
        <Finding
          title="黒塗りの下にテキストが残っています"
          count={report.hiddenText.length}
          desc="以下の文字列は画面上は隠れていますが、コピー＆ペーストで読み取れる状態です。"
        >
          <ul className="space-y-1.5">
            {report.hiddenText.map((h, i) => (
              <li key={i} className="rounded-md bg-ink px-3.5 py-2.5">
                <code className="break-anywhere font-mono text-sm text-[oklch(0.82_0.13_25)]">
                  {h.text}
                </code>
                <span className="mt-1 block text-xs text-white/55">{h.page + 1}ページ目</span>
              </li>
            ))}
          </ul>
        </Finding>
      )}

      {report.orphans.length > 0 && (
        <Finding
          title="削除されたはずの原本がファイル内に残っています"
          count={report.orphans.length}
          desc="墨消し後の保存でごみ収集が行われず、処理前の内容が参照されないまま残存しています。画面表示にも通常のテキスト抽出にも現れないため、開いて確認しただけでは気づけません。"
        >
          <ul className="space-y-4">
            {report.orphans.map((o) => (
              <li key={o.objNum}>
                {o.recovered.length > 0 ? (
                  <>
                    <p className="mb-1.5 text-sm text-muted">
                      現在のページには無い、つまり削除されたはずの文字列です。
                    </p>
                    <ul className="space-y-1.5">
                      {o.recovered.map((t, i) => (
                        <li key={i} className="rounded-md bg-ink px-3.5 py-2.5">
                          <code className="break-anywhere font-mono text-sm text-[oklch(0.82_0.13_25)]">
                            {t}
                          </code>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 font-mono text-xs text-muted">
                      オブジェクト #{o.objNum} — {o.bytes} バイト
                    </p>
                  </>
                ) : (
                  <div className="rounded-sm bg-surface px-3 py-2 font-mono text-sm text-muted">
                    オブジェクト #{o.objNum} — {o.bytes} バイト / 文字描画命令 {o.textOps} 個
                    <span className="mt-1 block font-sans text-xs">
                      中身は復元できませんでした（対応するフォント資源が特定できないため）。
                      残存していること自体は確かです。
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Finding>
      )}

      {report.pastVersionText.length > 0 && (
        <Finding
          title="過去の版に削除前の内容が残っています"
          count={report.pastVersionText.length}
          desc="上書き保存（増分保存）で以前の版がファイル内に残っています。ファイルの前半だけを読み込むと、以下の文字列がそのまま復元できます。"
        >
          <ul className="space-y-1.5">
            {report.pastVersionText.map((t, i) => (
              <li key={i} className="rounded-md bg-ink px-3.5 py-2.5">
                <code className="break-anywhere font-mono text-sm text-[oklch(0.82_0.13_25)]">{t}</code>
              </li>
            ))}
          </ul>
        </Finding>
      )}

      {(report.metadata.length > 0 || report.embeddedFiles.length > 0) && (
        <Finding
          title="メタデータが残っています"
          count={report.metadata.length + report.embeddedFiles.length}
          desc="本文とは別に、以下の情報がファイルに保存されています。"
        >
          <dl className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {report.metadata.map((m) => (
              <div key={m.key} className="flex gap-3 bg-surface px-3 py-2 text-sm">
                <dt className="w-24 shrink-0 text-muted">{m.key}</dt>
                <dd className="break-anywhere font-mono text-ink">{m.value}</dd>
              </div>
            ))}
            {report.embeddedFiles.map((f) => (
              <div key={f} className="flex gap-3 bg-surface px-3 py-2 text-sm">
                <dt className="w-24 shrink-0 text-muted">埋め込み</dt>
                <dd className="break-anywhere font-mono text-ink">{f}</dd>
              </div>
            ))}
          </dl>
        </Finding>
      )}

      {report.verdict === "clean" ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          ただし本ツールは画像内の文字（スキャン文書）を判定対象としていません。
          <Link href="/guide" className="ml-1 text-accent underline underline-offset-2">
            検出できないケースを確認する
          </Link>
        </p>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-5">
          <div className="prose-width">
            <p className="font-bold text-ink">このファイルを墨消しする</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              文字データごと削除し、消えたことを確認した記録を出力します。
            </p>
          </div>
          <ButtonLink href="/redact" variant="primary" className="ml-auto">
            墨消しツールへ
          </ButtonLink>
        </div>
      )}
    </section>
  );
}

function Finding({
  title,
  count,
  desc,
  children,
}: {
  title: string;
  count: number;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="flex flex-wrap items-center gap-2 font-bold text-ink">
        {title}
        <Badge tone="bad" mark={false}>
          {count} 件
        </Badge>
      </h3>
      <p className="prose-width mb-4 mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
      {children}
    </div>
  );
}
