"use client";

import { useCallback, useRef, useState } from "react";
import Link from "@/lib/link.tsx";
import type { Report } from "@/lib/analyze.ts";
import { PdfWorker, checkFileSize } from "@/lib/client.ts";
import { useLicense } from "@/lib/use-license.ts";
import { Badge, Button, ButtonLink, Panel, type Tone } from "@/components/ui.tsx";

type Row = {
  name: string;
  size: number;
  state: "waiting" | "checking" | "done" | "error";
  report?: Report;
  error?: string;
};

/** 何件ごとにワーカーを作り直すか。WASM ヒープの積み上がりを断ち切るため */
const WORKER_RECYCLE_EVERY = 20;

const VERDICT: Record<Report["verdict"], { label: string; tone: Tone }> = {
  danger: { label: "危険", tone: "bad" },
  warning: { label: "注意", tone: "warn" },
  clean: { label: "検出なし", tone: "ok" },
};

export default function BatchPage() {
  const { license, loading } = useLicense();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (files: File[]) => {
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!pdfs.length) return;

    setRows(pdfs.map((f) => ({ name: f.name, size: f.size, state: "waiting" })));
    setRunning(true);

    // ワーカーは使い回す。ファイルごとに作ると 10MB の WASM を毎回読み直すことになる。
    // ただし mupdf の内部オブジェクトは完全には解放されず少しずつ積み上がるため、
    // 一定件数ごとに作り直して WASM ヒープを基準値に戻す。
    let worker = new PdfWorker();
    try {
      for (let i = 0; i < pdfs.length; i++) {
        if (i > 0 && i % WORKER_RECYCLE_EVERY === 0) {
          worker.terminate();
          worker = new PdfWorker();
        }
        setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "checking" } : x)));
        const tooBig = checkFileSize(pdfs[i].size);
        if (tooBig) {
          setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "error", error: tooBig } : x)));
          continue;
        }
        try {
          await worker.open(await pdfs[i].arrayBuffer());
          const { report } = await worker.analyze();
          setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "done", report } : x)));
        } catch (e) {
          setRows((r) =>
            r.map((x, j) =>
              j === i
                ? { ...x, state: "error", error: e instanceof Error ? e.message : String(e) }
                : x,
            ),
          );
        }
      }
    } finally {
      worker.terminate();
      setRunning(false);
    }
  }, []);

  const exportCsv = () => {
    const head = "ファイル名,ページ数,判定,黒塗り下のテキスト,削除前の原本（孤児・過去の版）,メタデータ\n";
    const body = rows
      .filter((r) => r.report)
      .map((r) => {
        const p = r.report!;
        const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
        return [
          q(r.name),
          p.pageCount,
          q(VERDICT[p.verdict].label),
          p.hiddenText.length,
          p.orphans.length + (p.pastVersionText.length > 0 ? 1 : 0),
          p.metadata.length,
        ].join(",");
      })
      .join("\n");
    // Excel が UTF-8 と判別できるよう BOM を付ける
    const blob = new Blob(["﻿" + head + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `一括診断結果_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const done = rows.filter((r) => r.state === "done");
  const problems = done.filter((r) => r.report!.verdict !== "clean");

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
      </div>
    );
  }

  if (!license) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink">一括診断</h1>
        <p className="prose-width mt-4 leading-relaxed text-muted">
          複数の PDF をまとめて診断し、どのファイルに問題があるかを一覧にします。
          既に公開済みの文書を後から点検する場合に使います。
        </p>
        <Panel className="mt-8">
          <h2 className="font-bold text-ink">ライセンスが必要です</h2>
          <p className="prose-width mt-2 text-sm leading-relaxed text-muted">
            1 ファイルずつの診断と墨消しは、ライセンスなしで全て無料で利用できます。
            この画面はまとめて処理するためのもので、ライセンスで解放されます（販売準備中）。
            自治体・大学・企業で評価したい場合は、評価用のキーをお送りします。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/contact" variant="primary">
              評価用キーを依頼する
            </ButtonLink>
            <ButtonLink href="/license">ライセンスを登録</ButtonLink>
            <ButtonLink href="/">1 ファイルずつ診断する</ButtonLink>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink">一括診断</h1>
        <Badge tone="ok">{license.org}</Badge>
      </div>
      <p className="prose-width mt-4 leading-relaxed text-muted">
        複数の PDF をまとめて診断します。ファイルは 1 件ずつ順に処理され、
        いずれもブラウザ内で完結します。件数が多い場合は時間がかかります。
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          run([...e.dataTransfer.files]);
        }}
        className={`mt-8 rounded-lg border border-dashed transition-colors duration-150 ${
          dragging ? "border-primary bg-primary-soft" : "border-line-strong bg-surface"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={running}
          className="flex w-full flex-col items-center gap-2 px-6 py-12 disabled:cursor-wait"
        >
          <span className="text-md font-medium text-ink">
            {running ? "診断中…" : "PDF をまとめてドロップ、またはクリックして選択"}
          </span>
          <span className="text-sm text-muted">アップロードは発生しません</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            run([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <section className="mt-8" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-ink">
              結果 {done.length} / {rows.length} 件
            </h2>
            {problems.length > 0 && (
              <Badge tone="bad" mark={false}>
                要対応 {problems.length} 件
              </Badge>
            )}
            {done.length > 0 && !running && (
              <Button size="sm" className="ml-auto" onClick={exportCsv}>
                CSV で書き出す
              </Button>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left">
                  <th scope="col" className="py-2.5 font-semibold text-ink">ファイル名</th>
                  <th scope="col" className="w-20 py-2.5 text-right font-semibold text-ink">ページ</th>
                  <th scope="col" className="w-24 py-2.5 font-semibold text-ink">判定</th>
                  <th scope="col" className="w-24 py-2.5 text-right font-semibold text-ink">残存文字</th>
                  <th scope="col" className="w-24 py-2.5 text-right font-semibold text-ink">原本</th>
                  <th scope="col" className="w-28 py-2.5 text-right font-semibold text-ink">メタデータ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-b border-line">
                    <th scope="row" className="break-anywhere py-2.5 pr-4 text-left font-normal text-ink">
                      {r.name}
                    </th>
                    {r.state === "done" ? (
                      <>
                        <td className="py-2.5 text-right text-muted">{r.report!.pageCount}</td>
                        <td className="py-2.5">
                          <Badge tone={VERDICT[r.report!.verdict].tone}>
                            {VERDICT[r.report!.verdict].label}
                          </Badge>
                        </td>
                        <Num n={r.report!.hiddenText.length} />
                        {/* 件数は「残っている箇所」: 孤児オブジェクトごとに 1、過去の版はまとめて 1 */}
                        <Num n={r.report!.orphans.length + (r.report!.pastVersionText.length > 0 ? 1 : 0)} />
                        <Num n={r.report!.metadata.length} soft />
                      </>
                    ) : (
                      <td colSpan={5} className="py-2.5 text-muted">
                        {r.state === "checking"
                          ? "診断中…"
                          : r.state === "error"
                            ? `解析できません（${r.error}）`
                            : "待機中"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {problems.length > 0 && !running && (
            <Panel tone="bad" className="mt-6">
              <p className="font-bold text-ink">{problems.length} 件に問題が見つかりました</p>
              <p className="prose-width mt-1.5 text-sm leading-relaxed text-muted">
                該当ファイルは墨消しツールで 1 件ずつ処理してください。
                削除する範囲の判断は人が行う必要があるため、一括での墨消しは行いません。
              </p>
              <ButtonLink href="/redact" variant="primary" className="mt-4">
                墨消しツールへ
              </ButtonLink>
            </Panel>
          )}
        </section>
      )}

      <p className="mt-10 text-sm text-muted">
        判定の意味は
        <Link href="/guide" className="mx-1 text-accent underline underline-offset-2">
          自己点検の手順
        </Link>
        を参照してください。
      </p>
    </div>
  );
}

function Num({ n, soft }: { n: number; soft?: boolean }) {
  return (
    <td
      className={`py-2.5 text-right tabular-nums ${
        n === 0 ? "text-muted" : soft ? "text-ink" : "font-bold text-danger"
      }`}
    >
      {n}
    </td>
  );
}
