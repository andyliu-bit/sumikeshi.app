// 解析・描画・墨消しをまとめて Web Worker 内で行う。
// UI を止めないことに加え、ファイルがページ側から離れないことを保証する。
//
// mupdf はバンドルさせず public/mupdf/ から実行時に読み込む。
// turbopackIgnore を付けないとバンドラが静的解決を試みて失敗する
// （mupdf-wasm.js に Node 判定下でのみ動く `await import("module")` があるため）。
import { createAnalyzer, ENCRYPTED_MESSAGE } from "./analyze.ts";
import { createRedactor, type Area } from "./redact.ts";
import { sha256 } from "./certificate.ts";
import { createDetector } from "./detect.ts";
import { MUPDF_VERSION } from "./mupdf-version.ts";

// パスにバージョンを含める。CDN に 1年 immutable でキャッシュさせるため
// （public/_headers）。バージョンを上げれば URL ごと変わるので、
// 新しい js と古い wasm が混ざる事故が起きない。
// 変数経由の import なのでバンドラは解決を試みず、型も any になる。
const MUPDF_URL = `/mupdf/${MUPDF_VERSION}/mupdf.js`;
const mupdfPromise = import(/* turbopackIgnore: true */ MUPDF_URL);

export type PageSize = { width: number; height: number };

export type Req =
  | { id: number; type: "open"; bytes: ArrayBuffer }
  | { id: number; type: "analyze" }
  | { id: number; type: "detect"; includeOrganizations?: boolean }
  | { id: number; type: "render"; page: number; scale: number }
  | { id: number; type: "redact"; areas: Area[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mu: any = null;
let bytes: Uint8Array | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let doc: any = null;

const post = (msg: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    if (!mu) mu = await mupdfPromise;

    switch (req.type) {
      case "open": {
        // 一括処理では同じワーカーを使い回すため、前の文書を必ず解放する。
        // 怠ると WASM ヒープが積み上がり、数十件でクラッシュする。
        doc?.destroy();
        doc = null;
        bytes = new Uint8Array(req.bytes);
        doc = mu.PDFDocument.openDocument(bytes, "application/pdf");
        if (doc.needsPassword()) {
          doc.destroy();
          doc = null;
          bytes = null;
          throw new Error(ENCRYPTED_MESSAGE);
        }
        const pages: PageSize[] = [];
        for (let i = 0; i < doc.countPages(); i++) {
          const pg = doc.loadPage(i);
          const b = pg.getBounds();
          pg.destroy();
          pages.push({ width: b[2] - b[0], height: b[3] - b[1] });
        }
        post({ id: req.id, ok: true, pageCount: pages.length, pages });
        break;
      }

      case "analyze": {
        if (!bytes) throw new Error("ファイルが読み込まれていません");
        post({ id: req.id, ok: true, report: createAnalyzer(mu)(bytes) });
        break;
      }

      case "detect": {
        if (!bytes) throw new Error("ファイルが読み込まれていません");
        post({
          id: req.id,
          ok: true,
          ...createDetector(mu)(bytes, { includeOrganizations: req.includeOrganizations }),
        });
        break;
      }

      case "render": {
        if (!doc) throw new Error("ファイルが読み込まれていません");
        const pg = doc.loadPage(req.page);
        const pix = pg.toPixmap(
          mu.Matrix.scale(req.scale, req.scale),
          mu.ColorSpace.DeviceRGB,
          false,
          true,
        );
        const png = new Uint8Array(pix.asPNG());
        pix.destroy();
        pg.destroy();
        post(
          { id: req.id, ok: true, png: png.buffer, width: pix.getWidth(), height: pix.getHeight() },
          [png.buffer],
        );
        break;
      }

      case "redact": {
        if (!bytes) throw new Error("ファイルが読み込まれていません");
        const result = createRedactor(mu)(bytes, req.areas);
        // 転送してバッファを手放す前にハッシュを取る
        const sourceSha256 = await sha256(bytes);
        const outputSha256 = await sha256(result.pdf);
        const out = result.pdf.buffer as ArrayBuffer;
        post(
          {
            id: req.id,
            ok: true,
            pdf: out,
            removed: result.removed,
            areaStats: result.areaStats,
            report: result.report,
            stillReadable: result.stillReadable,
            verified: result.verified,
            sourceSha256,
            outputSha256,
            sourceBytes: bytes.byteLength,
          },
          [out],
        );
        break;
      }
    }
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
