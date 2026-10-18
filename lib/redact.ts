// 墨消し本体。
//
// 設計の要点は「消したと主張しない、消えたことを示す」。
// 処理後に必ず診断器（analyze）へ通し、その結果を証拠として返す。
// 処理報告書もこの出力を土台にする。
import type * as MuPDF from "mupdf";
// 拡張子付きで書く。Node で直接実行するテストと、バンドラ経由のワーカーの
// 両方から同じパスで解決させるため。
import { createAnalyzer, ENCRYPTED_MESSAGE, type Report } from "./analyze.ts";

/** ページ座標（左上原点）。structured text の bbox と同じ系。 */
export type Area = { page: number; x: number; y: number; w: number; h: number };

/**
 * 領域ごとの削除実績。報告書に載せるのはこちらで、削除された文字列そのものは載せない。
 * 報告書は回覧・保管されるため、中身を書くと報告書自体が新たな漏洩源になる。
 */
export type AreaStat = { area: Area; charCount: number };

export type RedactResult = {
  pdf: Uint8Array;
  /** 実際に削除された文字列（処理前に領域内から採取したもの）。画面確認用 */
  removed: string[];
  /** 領域ごとの件数統計。報告書用 */
  areaStats: AreaStat[];
  /** 処理後のファイルを診断にかけた結果。これが証拠になる */
  report: Report;
  /** 削除対象がまだ読み取れる場合に埋まる。空であるべき */
  stillReadable: string[];
  verified: boolean;
};

type Mu = typeof MuPDF;

type Box = { x: number; y: number; w: number; h: number };

const overlaps = (b: Box, a: Area) =>
  b.x < a.x + a.w && a.x < b.x + b.w && b.y < a.y + a.h && a.y < b.y + b.h;

/** b の面積のうち a に含まれる割合 */
function coverage(b: Box, a: Area): number {
  const ix = Math.max(0, Math.min(b.x + b.w, a.x + a.w) - Math.max(b.x, a.x));
  const iy = Math.max(0, Math.min(b.y + b.h, a.y + a.h) - Math.max(b.y, a.y));
  const size = b.w * b.h;
  return size > 0 ? (ix * iy) / size : 0;
}

/**
 * 検証で「消え残り」と見なす被覆率。
 *
 * 単純な交差判定は使えない。ユーザーが引いた矩形は行の途中や複数行にまたがるため、
 * 縁をかすめただけの隣接テキスト（消さないのが正しい）まで残存と判定してしまう。
 * 検証すべきは「囲んだ範囲の中身が消えたか」であって、縁に触れた要素の有無ではない。
 */
const RESIDUE_COVERAGE = 0.5;

/** ページを開いて行を取り出し、確実に解放する。destroy を怠ると WASM ヒープに残る */
function linesOf(doc: MuPDF.PDFDocument, pageIndex: number) {
  const page = doc.loadPage(pageIndex);
  const stext = page.toStructuredText("preserve-whitespace");
  const json = JSON.parse(stext.asJSON());
  stext.destroy();
  page.destroy();
  const out: { text: string; bbox: { x: number; y: number; w: number; h: number } }[] = [];
  for (const block of json.blocks ?? []) {
    if (block.type !== "text") continue;
    for (const line of block.lines ?? []) {
      if (line.text?.trim()) out.push({ text: line.text, bbox: line.bbox });
    }
  }
  return out;
}

export function createRedactor(mu: Mu) {
  const analyze = createAnalyzer(mu);

  return function redact(bytes: Uint8Array, areas: Area[]): RedactResult {
    const doc = mu.PDFDocument.openDocument(bytes, "application/pdf") as MuPDF.PDFDocument;
    // 復号できないまま処理すると、何も消さずに「検証済み」になる
    if (doc.needsPassword()) {
      doc.destroy();
      throw new Error(ENCRYPTED_MESSAGE);
    }

    const byPage = new Map<number, Area[]>();
    for (const a of areas) {
      if (!byPage.has(a.page)) byPage.set(a.page, []);
      byPage.get(a.page)!.push(a);
    }

    // 1) 何を消したかを先に採取する。処理後は取り出せなくなるため。
    const removed: string[] = [];
    const areaStats: AreaStat[] = [];
    for (const [pageIdx, pageAreas] of byPage) {
      const lines = linesOf(doc, pageIdx);
      for (const line of lines) {
        if (pageAreas.some((a) => overlaps(line.bbox, a))) removed.push(line.text);
      }
      // 領域単位でも数えておく（報告書用。内容ではなく文字数だけ）
      for (const a of pageAreas) {
        let charCount = 0;
        for (const line of lines) {
          if (overlaps(line.bbox, a)) charCount += line.text.trim().length;
        }
        areaStats.push({ area: a, charCount });
      }
    }

    // 2) Redact 注釈を置いて適用する。
    //    黒塗りの見た目は残しつつ、下の文字・画像・線画は実体ごと削除する。
    for (const [pageIdx, pageAreas] of byPage) {
      const page = doc.loadPage(pageIdx);
      const annots = pageAreas.map((a) => {
        const annot = page.createAnnotation("Redact");
        annot.setRect([a.x, a.y, a.x + a.w, a.y + a.h]);
        return annot;
      });
      page.update();
      page.applyRedactions(
        true,
        mu.PDFPage.REDACT_IMAGE_REMOVE,
        mu.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
        mu.PDFPage.REDACT_TEXT_REMOVE,
      );
      for (const annot of annots) annot.destroy();
      page.destroy();
    }

    // 3) メタデータも落とす。本文を消しても作成者名や元パスが残ると意味がない。
    //    Info 辞書は丸ごと外す。標準の 6 項目以外（Company など）にも名前が入る。
    //    XMP はカタログだけでなくページや画像にも付けられる。参照を外せば保存時の gc で消える。
    doc.getTrailer().delete("Info");
    for (let i = 1; i < doc.countObjects(); i++) {
      const obj = doc.newIndirect(i).resolve();
      if (obj.isDictionary() && !obj.get("Metadata").isNull()) obj.delete("Metadata");
    }

    // 4) 保存。garbage collection を外すと旧 content stream が孤児として残り、
    //    墨消しが無かったことになる（SPIKE.md 参照）。ここは変更禁止。
    const buf = doc.saveToBuffer("compress,garbage=deduplicate");
    const pdf = new Uint8Array(buf.asUint8Array()); // mupdf 側の解放に備えて複製
    buf.destroy();

    // 5) 保存後のファイルを診断にかけ、結果を証拠として返す
    const report = analyze(pdf);

    // 検証は「対象領域から文字が取れないこと」で行う。
    // 全文検索で removed の文字列を探す方法は使えない。実文書ではタイトルが
    // 各ページのヘッダに繰り返し現れるため、消した箇所とは無関係な別ページの
    // 同一文字列を拾って誤判定する。
    const afterDoc = mu.PDFDocument.openDocument(pdf, "application/pdf") as MuPDF.PDFDocument;
    const stillReadable: string[] = [];
    for (const [pageIdx, pageAreas] of byPage) {
      for (const line of linesOf(afterDoc, pageIdx)) {
        if (pageAreas.some((a) => coverage(line.bbox, a) > RESIDUE_COVERAGE)) {
          stillReadable.push(line.text);
        }
      }
    }

    doc.destroy();
    afterDoc.destroy();

    return {
      pdf,
      removed,
      areaStats,
      report,
      stillReadable,
      verified: stillReadable.length === 0 && report.verdict === "clean",
    };
  };
}
