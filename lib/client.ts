// ワーカーとのやり取りを Promise にまとめる薄いラッパ。
// 診断ページと墨消しページの両方から使う。
import type { Report } from "./analyze.ts";
import type { Area, AreaStat } from "./redact.ts";
import type { Candidate } from "./detect.ts";
import type { PageSize } from "./worker.ts";

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void };

/**
 * 受け付けるファイルサイズの上限。
 * 上限を設けないと、巨大な PDF でブラウザごと応答しなくなる。
 * 描画は 1 ページずつ解放しているので、効くのは元データの確保時。
 */
export const MAX_FILE_BYTES = 150 * 1024 * 1024;

export function checkFileSize(size: number): string | null {
  return size > MAX_FILE_BYTES
    ? `ファイルサイズが上限（${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB）を超えています。ページを分割してからお試しください。`
    : null;
}

export class PdfWorker {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent) => {
      const { id, ok, error, ...rest } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok) p.resolve(rest as never);
      else p.reject(new Error(error));
    };
    // ワーカー自体が落ちた場合（WASM のメモリ不足など）は onmessage が来ない。
    // ここで拾わないと待機中の Promise が永久に解決されず、画面が「処理中」のまま固まる。
    this.worker.onerror = (e) =>
      this.failAll(new Error(e.message || "処理中にエラーが発生しました"));
    this.worker.onmessageerror = () => this.failAll(new Error("結果を受け取れませんでした"));
  }

  /** 待機中の呼び出しをまとめて失敗させる */
  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private call<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  open(bytes: ArrayBuffer) {
    return this.call<{ pageCount: number; pages: PageSize[] }>({ type: "open", bytes }, [bytes]);
  }

  analyze() {
    return this.call<{ report: Report }>({ type: "analyze" });
  }

  detect(includeOrganizations = false) {
    return this.call<{ candidates: Candidate[]; imageCount: number }>({
      type: "detect",
      includeOrganizations,
    });
  }

  render(page: number, scale: number) {
    return this.call<{ png: ArrayBuffer; width: number; height: number }>({
      type: "render",
      page,
      scale,
    });
  }

  redact(areas: Area[]) {
    return this.call<{
      pdf: ArrayBuffer;
      removed: string[];
      areaStats: AreaStat[];
      report: Report;
      stillReadable: string[];
      verified: boolean;
      sourceSha256: string;
      outputSha256: string;
      sourceBytes: number;
    }>({ type: "redact", areas });
  }

  terminate() {
    // 先に待機中を片付ける。放置すると呼び出し元の finally が実行されず、
    // ワーカー（10MB の WASM を抱えている）が解放されないまま残る。
    this.failAll(new Error("処理が中断されました"));
    this.worker.terminate();
  }
}
