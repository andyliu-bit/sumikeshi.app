"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/lib/link.tsx";
import type { Report } from "@/lib/analyze.ts";
import type { Area, AreaStat } from "@/lib/redact.ts";
import { PdfWorker, checkFileSize } from "@/lib/client.ts";
import { buildCertificate, renderCertificateHtml } from "@/lib/certificate.ts";
import type { Candidate } from "@/lib/detect.ts";
import { Button } from "@/components/ui.tsx";

/** 描画倍率。表示は CSS で縮めるので、実座標はこの倍率で持つ */
const SCALE = 1.5;

type Loaded = { name: string; pageCount: number };

type Result = {
  pdf: ArrayBuffer;
  removed: string[];
  areaStats: AreaStat[];
  report: Report;
  stillReadable: string[];
  verified: boolean;
  sourceSha256: string;
  outputSha256: string;
  sourceBytes: number;
};

export default function RedactPage() {
  const workerRef = useRef<PdfWorker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [areas, setAreas] = useState<Area[]>([]);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [imageCount, setImageCount] = useState(0);
  const [includeOrgs, setIncludeOrgs] = useState(false);
  const [organization, setOrganization] = useState("");

  useEffect(() => () => workerRef.current?.terminate(), []);

  const openFile = useCallback(async (file: File) => {
    const tooBig = checkFileSize(file.size);
    if (tooBig) {
      setError(tooBig);
      return;
    }
    setError(null);
    setResult(null);
    setAreas([]);
    setCandidates([]);
    setPicked(new Set());
    setImageCount(0);
    setPageIdx(0);
    setBusy("読み込み中…");
    workerRef.current?.terminate();
    const w = new PdfWorker();
    workerRef.current = w;
    try {
      const { pageCount } = await w.open(await file.arrayBuffer());
      setLoaded({ name: file.name, pageCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  // ページ描画
  useEffect(() => {
    const w = workerRef.current;
    if (!w || !loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { png } = await w.render(pageIdx, SCALE);
        if (cancelled) return;
        setBitmap(await createImageBitmap(new Blob([png], { type: "image/png" })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, pageIdx]);

  // canvas 合成（ページ画像＋選択領域）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);

    ctx.fillStyle = "oklch(0.5 0.19 25 / 0.38)";
    ctx.strokeStyle = "oklch(0.5 0.19 25)";
    ctx.lineWidth = 2;
    for (const a of areas.filter((a) => a.page === pageIdx)) {
      ctx.fillRect(a.x * SCALE, a.y * SCALE, a.w * SCALE, a.h * SCALE);
      ctx.strokeRect(a.x * SCALE, a.y * SCALE, a.w * SCALE, a.h * SCALE);
    }
    if (drag) {
      const x = Math.min(drag.x0, drag.x1) * SCALE;
      const y = Math.min(drag.y0, drag.y1) * SCALE;
      const w = Math.abs(drag.x1 - drag.x0) * SCALE;
      const h = Math.abs(drag.y1 - drag.y0) * SCALE;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }, [bitmap, areas, pageIdx, drag]);

  /** 画面上のクリック位置を PDF 座標へ */
  const toPdf = (e: React.MouseEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: (((e.clientX - r.left) / r.width) * c.width) / SCALE,
      y: (((e.clientY - r.top) / r.height) * c.height) / SCALE,
    };
  };

  const autoSelect = async () => {
    const w = workerRef.current;
    if (!w) return;
    setBusy("診断中…");
    try {
      const { report } = await w.analyze();
      const found = report.hiddenText.map((h) => ({ page: h.page, ...h.bbox }));
      if (found.length === 0) setError("黒塗りの下に残ったテキストは見つかりませんでした。手動で範囲を指定してください。");
      else setAreas((prev) => [...prev, ...found]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const detectPii = async () => {
    const w = workerRef.current;
    if (!w) return;
    setBusy("検出中…");
    setError(null);
    try {
      const { candidates: found, imageCount: imgs } = await w.detect(includeOrgs);
      setCandidates(found);
      setImageCount(imgs);
      // 既定では全て選ぶが、内容は一覧で必ず見えるようにしている。
      // 適用の判断は利用者に残す方針のため、そのまま実行はしない。
      setPicked(new Set(found.map((c) => c.id)));
      if (found.length === 0) {
        setError("個人情報らしき記載は見つかりませんでした。手動で範囲を指定してください。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const addPicked = () => {
    const add = candidates.filter((c) => picked.has(c.id)).map((c) => c.area);
    setAreas((prev) => [...prev, ...add]);
    setCandidates((prev) => prev.filter((c) => !picked.has(c.id)));
    setPicked(new Set());
  };

  const run = async () => {
    const w = workerRef.current;
    // 範囲 0 件でも実行できる。全体を gc 付きで書き直すので、孤児・過去の版・メタデータは消える
    if (!w) return;
    setBusy("墨消し処理中…");
    setError(null);
    try {
      setResult(await w.redact(areas));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const outputName = loaded ? loaded.name.replace(/\.pdf$/i, "") + "_墨消し済み.pdf" : "";

  const download = () => {
    if (!result || !loaded) return;
    save(new Blob([result.pdf], { type: "application/pdf" }), outputName);
  };

  const downloadCertificate = () => {
    if (!result || !loaded) return;
    const cert = buildCertificate({
      source: { name: loaded.name, bytes: result.sourceBytes, sha256: result.sourceSha256 },
      output: { name: outputName, bytes: result.pdf.byteLength, sha256: result.outputSha256 },
      areaStats: result.areaStats,
      report: result.report,
      stillReadable: result.stillReadable,
      organization: organization.trim() || undefined,
    });
    save(
      new Blob([renderCertificateHtml(cert)], { type: "text/html;charset=utf-8" }),
      loaded.name.replace(/\.pdf$/i, "") + "_処理報告書.html",
    );
  };

  const pageAreas = areas.filter((a) => a.page === pageIdx);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">PDF墨消しツール</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          黒い四角を重ねるのではなく、文字データそのものを削除します。
          処理後は自動で診断を行い、消えたことを確認した結果を表示します。
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="text-primary">●</span>
          ファイルはブラウザ内だけで処理され、サーバーには送信されません。
        </p>
      </header>

      {!loaded && (
        <div
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-lg border border-dashed border-line-strong bg-surface px-6 py-14 text-center transition-colors duration-150 hover:border-primary hover:bg-primary-soft"
        >
          <p className="text-base font-medium text-ink">PDF をクリックして選択</p>
          <p className="mt-2 text-sm text-muted">アップロードは発生しません</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openFile(f);
        }}
      />

      {error && (
        <p className="mt-5 rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink border border-warning/30">
          {error}
        </p>
      )}

      {loaded && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
                disabled={pageIdx === 0}
                className="rounded-md bg-bg px-3 py-1.5 text-sm border border-line-strong disabled:opacity-40"
              >
                前へ
              </button>
              <span className="text-sm text-muted">
                {pageIdx + 1} / {loaded.pageCount}
              </span>
              <button
                onClick={() => setPageIdx((p) => Math.min(loaded.pageCount - 1, p + 1))}
                disabled={pageIdx >= loaded.pageCount - 1}
                className="rounded-md bg-bg px-3 py-1.5 text-sm border border-line-strong disabled:opacity-40"
              >
                次へ
              </button>
              <span className="ml-auto truncate text-sm text-muted">{loaded.name}</span>
            </div>

            <div className="overflow-hidden rounded-lg bg-bg border border-line-strong">
              <canvas
                ref={canvasRef}
                className="w-full cursor-crosshair select-none"
                onMouseDown={(e) => {
                  const p = toPdf(e);
                  setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                }}
                onMouseMove={(e) => {
                  if (!drag) return;
                  const p = toPdf(e);
                  setDrag({ ...drag, x1: p.x, y1: p.y });
                }}
                onMouseUp={() => {
                  if (!drag) return;
                  const x = Math.min(drag.x0, drag.x1);
                  const y = Math.min(drag.y0, drag.y1);
                  const w = Math.abs(drag.x1 - drag.x0);
                  const h = Math.abs(drag.y1 - drag.y0);
                  // 誤クリックで極小の領域が増えないよう下限を設ける
                  if (w > 3 && h > 3) setAreas((prev) => [...prev, { page: pageIdx, x, y, w, h }]);
                  setDrag(null);
                }}
                onMouseLeave={() => setDrag(null)}
              />
            </div>
            <p className="mt-2 text-sm text-muted">
              消したい範囲をドラッグして囲みます。複数指定・複数ページ可。
            </p>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-line bg-bg p-4">
              <h2 className="text-sm font-bold text-ink">候補を探す</h2>
              <div className="mt-3 space-y-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={detectPii}
                  disabled={!!busy}
                >
                  個人情報を検出
                </Button>
                <Button size="sm" className="w-full" onClick={autoSelect} disabled={!!busy}>
                  黒塗りの残りを検出
                </Button>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-muted">
                電話番号・郵便番号・メールアドレス・個人番号と、氏名や住所の記入欄を探します。
                検出は候補の提示までで、削除するかどうかは確認のうえ選んでください。
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-line pt-3">
                <input
                  type="checkbox"
                  checked={includeOrgs}
                  onChange={(e) => setIncludeOrgs(e.target.checked)}
                  className="mt-0.5 accent-[oklch(0.38_0.095_162)]"
                />
                <span className="text-xs leading-relaxed">
                  <span className="font-semibold text-ink">組織名・学校名も含める</span>
                  <span className="mt-0.5 block text-muted">
                    文書全体を匿名化する場合に使います。通常の公開前確認では、組織名は本文の一部として
                    残すのが普通です（議事録の「日本銀行」など）。
                  </span>
                </span>
              </label>
            </div>

            {imageCount > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning-soft p-4">
                <p className="text-sm font-bold text-ink">画像が {imageCount} 個あります</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  顔写真・印影・スキャンされた署名は画像であり、文字として検出できません。
                  該当するものがあれば、ドラッグで範囲を指定してください。
                </p>
              </div>
            )}

            {candidates.length > 0 && (
              <div className="rounded-lg border border-line bg-bg p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold text-ink">検出された候補 {candidates.length} 件</h2>
                  <button
                    onClick={() =>
                      setPicked(
                        picked.size === candidates.length
                          ? new Set()
                          : new Set(candidates.map((c) => c.id)),
                      )
                    }
                    className="text-xs text-muted underline hover:text-ink"
                  >
                    {picked.size === candidates.length ? "全て外す" : "全て選ぶ"}
                  </button>
                </div>

                <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <label
                        className={`flex cursor-pointer gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors duration-150 ${
                          picked.has(c.id)
                            ? "border-primary/40 bg-primary-soft"
                            : "border-line bg-bg hover:bg-surface"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={picked.has(c.id)}
                          onChange={() => {
                            const next = new Set(picked);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            setPicked(next);
                          }}
                          className="mt-1 accent-[oklch(0.38_0.095_162)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                              {c.label}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setPageIdx(c.page);
                              }}
                              className="text-xs text-accent underline underline-offset-2"
                            >
                              {c.page + 1}ページ
                            </button>
                          </span>
                          <span className="break-anywhere mt-0.5 block font-mono text-sm text-ink">
                            {c.text}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                <Button
                  size="sm"
                  className="mt-3 w-full"
                  disabled={picked.size === 0}
                  onClick={addPicked}
                >
                  選んだ {picked.size} 件を削除範囲に追加
                </Button>
              </div>
            )}

            <div className="rounded-lg bg-bg p-4 border border-line">
              <h2 className="text-sm font-bold text-ink">
                削除範囲 {areas.length} 件
                {areas.length > 0 && (
                  <span className="ml-1.5 font-normal text-muted">
                    （このページ {pageAreas.length} 件）
                  </span>
                )}
              </h2>
              {areas.length > 0 && (
                <button
                  onClick={() => setAreas([])}
                  className="mt-2 text-xs text-muted underline hover:text-ink"
                >
                  すべて解除
                </button>
              )}
              <button
                onClick={run}
                disabled={!!busy}
                className="mt-3 w-full rounded-md bg-danger px-4 py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:opacity-40"
              >
                {busy ?? (areas.length === 0 ? "残存データとメタデータだけ除去する" : "墨消しを実行")}
              </button>
              {areas.length === 0 && (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  範囲を選ばずに実行すると、本文はそのままで、ファイル内に残った削除前の原本とメタデータだけを除去します。
                </p>
              )}
            </div>

            {result && (
              <ResultPanel
                result={result}
                onDownload={download}
                onDownloadCertificate={downloadCertificate}
                organization={organization}
                onOrganizationChange={setOrganization}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function ResultPanel({
  result,
  onDownload,
  onDownloadCertificate,
  organization,
  onOrganizationChange,
}: {
  result: Result;
  onDownload: () => void;
  onDownloadCertificate: () => void;
  organization: string;
  onOrganizationChange: (v: string) => void;
}) {
  const ok = result.verified;
  return (
    <div
      className={`rounded-lg border p-4 ${
        ok ? "border-primary/25 bg-primary-soft" : "border-danger/25 bg-danger-soft"
      }`}
    >
      <h2 className={`text-sm font-bold ${ok ? "text-primary" : "text-danger"}`}>
        {ok ? "削除を確認しました" : "検証に失敗しました"}
      </h2>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="対象領域の再抽出" ok={result.stillReadable.length === 0}
          value={result.stillReadable.length === 0 ? "文字なし" : `${result.stillReadable.length} 件残存`} />
        {/* 範囲の外に残った黒塗りの下のテキストも検証失敗の理由になる。行が無いと、全部合格なのに失敗と出る */}
        <Row label="黒塗りの下のテキスト" ok={result.report.hiddenText.length === 0}
          value={result.report.hiddenText.length === 0 ? "なし" : `${result.report.hiddenText.length} 件（範囲を選んで墨消しが必要）`} />
        <Row label="孤児オブジェクト" ok={result.report.orphans.length === 0}
          value={result.report.orphans.length === 0 ? "なし" : `${result.report.orphans.length} 件`} />
        <Row label="過去の版" ok={result.report.pastVersionText.length === 0}
          value={result.report.pastVersionText.length === 0 ? "なし" : `${result.report.pastVersionText.length} 件`} />
        <Row label="メタデータ" ok={result.report.metadata.length === 0}
          value={result.report.metadata.length === 0 ? "除去済み" : `${result.report.metadata.length} 件`} />
      </dl>

      {result.removed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            削除した内容 {result.removed.length} 件
          </summary>
          <ul className="mt-2 space-y-1">
            {result.removed.map((t, i) => (
              <li key={i} className="rounded bg-ink px-2.5 py-1.5">
                <code className="break-all font-mono text-xs text-[oklch(0.82_0.13_25)] line-through">{t}</code>
              </li>
            ))}
          </ul>
        </details>
      )}

      {ok && (
        <div className="mt-4 space-y-2">
          <button
            onClick={onDownload}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover"
          >
            墨消し済み PDF をダウンロード
          </button>
          <label className="block pt-1 text-xs text-muted">
            作成組織（任意。報告書に印字されます）
            <input
              type="text"
              value={organization}
              onChange={(e) => onOrganizationChange(e.target.value)}
              placeholder="例：〇〇市 総務課"
              className="mt-1 block w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            onClick={onDownloadCertificate}
            className="w-full rounded-md bg-bg px-4 py-2.5 text-sm font-medium text-ink border border-line-strong hover:bg-surface"
          >
            処理報告書をダウンロード
          </button>
          <p className="text-xs leading-relaxed text-muted">
            報告書には処理前後のファイルの SHA-256、削除箇所の位置と文字数、検証結果を記載します。
            削除した内容そのものは含まれません。ブラウザの印刷機能から PDF として保存できます。
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-primary" : "text-danger"} aria-hidden>
        {ok ? "✓" : "✕"}
      </span>
      <span className="sr-only">{ok ? "合格" : "不合格"}</span>
      <dt className="text-muted">{label}</dt>
      <dd className="ml-auto font-medium text-ink">{value}</dd>
    </div>
  );
}
