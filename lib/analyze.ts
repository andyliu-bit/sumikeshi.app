// PDF 墨消し診断のコアロジック。
//
// mupdf をトップレベルで import しない理由:
// mupdf-wasm.js には Node 判定下でのみ実行される `await import("module")` があり、
// バンドラが静的解決に失敗する。モジュールを引数で受け取る形にして、
// Node 側は通常 import、ブラウザ側は /mupdf/mupdf.js を実行時 import する。
import type * as MuPDF from "mupdf";

export type Severity = "danger" | "warning" | "clean";

export type HiddenText = {
  page: number;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  contrast: number;
};

export type Orphan = {
  objNum: number;
  bytes: number;
  textOps: number;
  /** 現在のページには存在しない＝削除されたはずなのに残っている文字列 */
  recovered: string[];
};

export type Report = {
  pageCount: number;
  hiddenText: HiddenText[];
  orphans: Orphan[];
  /** 増分保存で残った過去の版にだけ存在する文字列（現在の版には無い） */
  pastVersionText: string[];
  metadata: { key: string; value: string }[];
  embeddedFiles: string[];
  verdict: Severity;
};

/** 描画結果に現れないテキストを検出する際のコントラスト閾値（0-255） */
const CONTRAST_THRESHOLD = 40;
/**
 * 領域の平均輝度がページ背景からどれだけ離れていれば「塗り潰された」と見なすか。
 *
 * コントラストが低いだけでは不十分。縦書き文書では mupdf が 1 文字ずつを
 * 独立した line として返すため、「）」「。」のように字框内の墨の割合が極端に
 * 低い文字は、字框を測っても背景しか拾えずコントラスト 0 になる。
 * 黒塗りは「背景と大きく異なる均一色」、空の字框は「背景と同色」で区別できる。
 */
const BG_DIFF_THRESHOLD = 60;
/** ページ描画倍率。小さすぎると細い文字を拾えない */
const RENDER_SCALE = 2;
/** 孤児の復元で試すページ数の上限（1 ページごとにテキスト抽出 2 回ぶんの費用がかかる） */
const MAX_PAGES_FOR_ORPHAN_RECOVERY = 8;
/** 復元して表示する行数の上限 */
const MAX_RECOVERED_LINES = 20;
/**
 * 孤児をどのページの資源で解釈したかを判定する閾値。
 * 正しいページなら現在の本文をほぼ全て含むので 1.0 近くになり、
 * 資源が合わないページでは文字化けして 0 近くになる。
 */
const MIN_ORPHAN_OVERLAP = 0.6;
/**
 * 過去の版を調べる上限。フォーム入力を重ねた PDF は版が数十あることがある。
 * shortcut: 最初の版と新しい側の 15 版だけを見る。間の版にだけ残った文字は見ない。実例が出たら広げる。
 */
const MAX_PAST_VERSIONS = 16;
/** XMP のうち、人や元文書を特定しうる項目 */
const XMP_KEYS = ["dc:creator", "dc:title", "dc:description", "xmp:CreatorTool", "pdf:Producer", "pdf:Keywords"];
/** Info 辞書のうち人や元文書を特定しない項目 */
const INFO_SKIP = new Set(["CreationDate", "ModDate", "Trapped"]);

const LATIN1 = new TextDecoder("latin1");

export const ENCRYPTED_MESSAGE = "パスワードで保護された PDF は診断できません。パスワードを外してから選択してください";

function tryDecode(enc: string, bytes: Uint8Array): string | null {
  try {
    const s = new TextDecoder(enc, { fatal: true }).decode(bytes);
    // 復号は通ったが制御文字が混ざる場合は符号化の読み違いとみなす
    return /[\u0000-\u0008\u000E-\u001F]/.test(s) ? null : s;
  } catch {
    return null;
  }
}

function decodeBytes(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return tryDecode("utf-16be", bytes.subarray(2));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return tryDecode("utf-16le", bytes.subarray(2));
  if (bytes.every((b) => b < 0x80)) return LATIN1.decode(bytes);
  // 検証の厳しい順に試す。UTF-8 を先に置かないと、Shift_JIS がほぼ任意の
  // バイト列を受理してしまい、UTF-8 の日本語を文字化けとして通してしまう。
  for (const enc of ["utf-8", "shift_jis", "euc-jp"]) {
    const s = tryDecode(enc, bytes);
    if (s !== null) return s;
  }
  return null;
}

/**
 * mupdf が復号できず `<hex>` のまま返したメタデータ文字列を復号する。
 *
 * 2007年頃の日本語 PDF は Info 辞書の文字列が BOM 無しの Shift_JIS で
 * 書かれていることがある。mupdf は符号化を判定できないため hex 文字列を
 * そのまま返し、診断結果に 16 進数の羅列が表示されてしまう。
 *
 * 実例（総務省 2007年の資料）:
 *   <4D6963726F736F667420576F7264202D208E9197BF...>
 *   → "Microsoft Word - 資料１－０４　会議等の公開について（案）.doc"
 */
export function decodePdfString(raw: string): string {
  const m = /^<([0-9A-Fa-f\s]*)>$/.exec(raw.trim());
  if (!m) return raw;
  const hex = m[1].replace(/\s+/g, "");
  if (hex.length < 2 || hex.length % 2 !== 0) return raw;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

  // 復号できなければ元の hex を返す。推測で壊れた文字列を見せるより、
  // 「読めない値が入っている」と分かる方が診断として正しい。
  return decodeBytes(bytes) ?? raw;
}

/**
 * 各版の終わり（%%EOF の直後）のバイト位置。増分保存されたファイルは
 * 版ごとに startxref … %%EOF が追記されるので、その位置で切れば過去の版がそのまま開ける。
 */
export function revisionEnds(bytes: Uint8Array): number[] {
  const ends: number[] = [];
  for (let i = bytes.indexOf(0x25); i !== -1 && i + 5 <= bytes.length; i = bytes.indexOf(0x25, i + 1)) {
    if (bytes[i + 1] !== 0x25 || bytes[i + 2] !== 0x45 || bytes[i + 3] !== 0x4f || bytes[i + 4] !== 0x46) continue;
    // 版の区切りは「startxref <xref の位置> %%EOF」。ストリーム中に偶然現れた文字列と、
    // 線形化 PDF 先頭の 1 ページ目用の区切り（startxref 0。版ではなく、開くと mupdf が警告を出す）は除く
    const m = /startxref\s+(\d+)\s*$/.exec(LATIN1.decode(bytes.subarray(Math.max(0, i - 64), i)));
    if (m && Number(m[1]) > 0) ends.push(i + 5);
  }
  return ends;
}

const XML_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decodeXmlEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : XML_ENTITIES[e] ?? m);

/**
 * XMP から人や元文書を特定しうる項目を「キー: 値」で並べる。該当項目が無ければ空文字。
 * ID や日時だけの XMP まで「注意」にすると、何も特定できない PDF を警告することになる。
 */
export function summarizeXmp(xml: string): string {
  const parts: string[] = [];
  for (const k of XMP_KEYS) {
    // 要素形式（<dc:creator>…</dc:creator>）と属性形式（pdf:Producer="…"）の両方がある
    const raw = new RegExp(`<${k}\\b[^>]*>([\\s\\S]*?)</${k}>`).exec(xml)?.[1] ??
      new RegExp(`\\s${k}="([^"]*)"`).exec(xml)?.[1] ?? "";
    const v = decodeXmlEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (v) parts.push(`${k}: ${v}`);
  }
  return parts.join(" / ");
}

type Mu = typeof MuPDF;

export function createAnalyzer(mu: Mu) {
  /**
   * 検出項目1: 黒塗りの下に生きているテキスト層。
   *
   * 「テキストとして抽出できるのに、描画結果ではその位置にコントラストが無い」
   * を漏洩の定義とする。黒矩形・画像・白文字白背景など隠し方を問わず拾える。
   */
  function findHiddenText(doc: MuPDF.PDFDocument, pageIndex: number): HiddenText[] {
    // mupdf のオブジェクトは明示的に destroy しないと WASM ヒープに残り続ける。
    // ピクスマップは A4 2倍描画で 1 ページ約 6MB あり、解放を怠ると数十件で破綻する。
    const page = doc.loadPage(pageIndex);
    const pix = page.toPixmap(
      mu.Matrix.scale(RENDER_SCALE, RENDER_SCALE),
      mu.ColorSpace.DeviceRGB,
      false,
      true,
    );
    const px = pix.getPixels();
    const W = pix.getWidth();
    const H = pix.getHeight();
    const nc = pix.getNumberOfComponents();
    const stride = pix.getStride();

    // ページ背景色 = 全画素の輝度の最頻値（文書ページの大部分は背景で占められる）
    const hist = new Uint32Array(256);
    for (let y = 0; y < H; y++) {
      const row = y * stride;
      for (let x = 0; x < W; x++) {
        const i = row + x * nc;
        hist[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
      }
    }
    let background = 0;
    let peak = 0;
    for (let i = 0; i < 256; i++) {
      if (hist[i] > peak) {
        peak = hist[i];
        background = i;
      }
    }

    // 既定では表示範囲の外の文字は抽出されない。範囲外に置かれた文字も読めてしまうので含める
    const stext = page.toStructuredText("preserve-whitespace,mediabox-clip=no");
    const json = JSON.parse(stext.asJSON());
    const out: HiddenText[] = [];

    for (const block of json.blocks ?? []) {
      if (block.type !== "text") continue;
      for (const line of block.lines ?? []) {
        const text: string = line.text ?? "";
        if (!text.trim()) continue;

        const b = line.bbox;
        const x0 = Math.max(0, Math.floor(b.x * RENDER_SCALE));
        const y0 = Math.max(0, Math.floor(b.y * RENDER_SCALE));
        const x1 = Math.min(W, Math.ceil((b.x + b.w) * RENDER_SCALE));
        const y1 = Math.min(H, Math.ceil((b.y + b.h) * RENDER_SCALE));
        if (x1 <= x0 || y1 <= y0) {
          // 表示範囲（CropBox）の外にある文字。画面には出ないがテキストとしては取れる
          out.push({ page: pageIndex, text, bbox: b, contrast: 0 });
          continue;
        }

        let min = 255;
        let max = 0;
        let sum = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          const row = y * stride;
          for (let x = x0; x < x1; x++) {
            const i = row + x * nc;
            const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
            count++;
          }
        }
        const contrast = max - min;
        const avg = sum / count;
        // 「コントラストが無い」だけでなく「背景とは違う色で塗られている」ことまで
        // 確認する。空の字框（背景と同色）を除外するための条件。
        if (contrast < CONTRAST_THRESHOLD && Math.abs(avg - background) > BG_DIFF_THRESHOLD) {
          out.push({ page: pageIndex, text, bbox: b, contrast: Math.round(contrast) });
        }
      }
    }
    stext.destroy();
    pix.destroy();
    page.destroy();
    return out;
  }

  /**
   * 隣接する検出結果を 1 件にまとめる。
   *
   * 縦書きでは mupdf が 1 文字ずつ line を返すため、まとめないと
   * 「山」「田」「太」「郎」が 4 件並ぶだけで、何が漏れているのか読めない。
   * 漏洩内容は繋がった形で見せてこそ意味がある。
   */
  function mergeAdjacent(items: HiddenText[]): HiddenText[] {
    const out: HiddenText[] = [];
    for (const cur of items) {
      const prev = out[out.length - 1];
      if (prev && prev.page === cur.page) {
        const a = prev.bbox;
        const b = cur.bbox;
        const unit = Math.max(a.h, b.h, a.w, b.w);
        const gapY = b.y - (a.y + a.h);
        const gapX = b.x - (a.x + a.w);
        // 縦に続く（同じ列）／横に続く（同じ行）。負の値は重なりなので許容する。
        const vertical = Math.abs(a.x - b.x) < unit * 0.6 && gapY < unit * 0.8 && gapY > -unit;
        const horizontal = Math.abs(a.y - b.y) < unit * 0.6 && gapX < unit * 0.8 && gapX > -unit;

        if (vertical || horizontal) {
          const x0 = Math.min(a.x, b.x);
          const y0 = Math.min(a.y, b.y);
          const x1 = Math.max(a.x + a.w, b.x + b.w);
          const y1 = Math.max(a.y + a.h, b.y + b.h);
          prev.bbox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
          // 縦書きの 1 文字ずつ、および同一行内の断片はそのまま連結し、
          // 行をまたぐ場合だけ区切りを入れる。
          // 判定に使うのは追加する側(cur)のみ。連結済みの prev の長さで判定すると
          // 3 文字目以降で不要な空白が混入する。
          const glue = horizontal || cur.text.length <= 2 ? "" : " ";
          prev.text += glue + cur.text;
          prev.contrast = Math.max(prev.contrast, cur.contrast);
          continue;
        }
      }
      out.push({ ...cur, bbox: { ...cur.bbox } });
    }
    return out;
  }

  /** trailer から到達可能なオブジェクト番号を収集する */
  function reachableObjects(doc: MuPDF.PDFDocument): Set<number> {
    const seen = new Set<number>();
    const stack: MuPDF.PDFObject[] = [doc.getTrailer()];
    while (stack.length) {
      const obj = stack.pop();
      if (!obj || obj.isNull()) continue;
      if (obj.isIndirect()) {
        const num = obj.asIndirect();
        if (seen.has(num)) continue;
        seen.add(num);
        stack.push(obj.resolve());
        continue;
      }
      if (obj.isArray() || obj.isDictionary()) {
        obj.forEach((v) => stack.push(v));
      }
    }
    return seen;
  }

  /** ページの現在のテキストを行単位で取り出す（描画しないので軽い） */
  function textOfPage(doc: MuPDF.PDFDocument, index: number): string[] {
    const page = doc.loadPage(index);
    const stext = page.toStructuredText("preserve-whitespace");
    const json = JSON.parse(stext.asJSON());
    stext.destroy();
    page.destroy();
    return (json.blocks ?? [])
      .flatMap((b: { lines?: { text?: string }[] }) => b.lines ?? [])
      .map((l: { text?: string }) => (l.text ?? "").trim())
      .filter((t: string) => t.length > 0);
  }

  /**
   * 孤児 content stream の中身を復元する。
   *
   * content stream 内の文字は glyph id なので、対応する Resources（フォント）が
   * 無いと読めない。ページの Contents を一時的に孤児と差し替えることで、
   * そのページのフォント資源で解釈させる。文書は保存しないので副作用は残らない。
   *
   * 返すのは孤児の全文ではなく、**現在のページに無い行だけ**。
   * 全文を出すと通常の本文に埋もれて、何が消し残っているのか読めなくなる。
   */
  function recoverOrphanText(doc: MuPDF.PDFDocument, objNum: number, pageCount: number): string[] {
    // 孤児がどのページの旧版かは分からないので順に試す。
    // 資源が合わないページでは何も取れないため、取れたページが当たり。
    const limit = Math.min(pageCount, MAX_PAGES_FOR_ORPHAN_RECOVERY);
    let best: { overlap: number; leaked: string[] } = { overlap: 0, leaked: [] };

    for (let p = 0; p < limit; p++) {
      const pageObj = doc.findPage(p);
      const original = pageObj.get("Contents");
      try {
        const before = textOfPage(doc, p);
        if (before.length === 0) continue;
        const beforeSet = new Set(before);

        pageObj.put("Contents", doc.newIndirect(objNum));
        const after = textOfPage(doc, p);

        // 孤児が「このページの旧版」なら、現在の本文をほぼそのまま含んでいるはず。
        // 資源が合わないページで解釈すると glyph id の対応が狂って文字化けし、
        // 重なりはほぼ 0 になる。最初に差分が出たページを採ると、
        // 文字化けを「消えた行」として報告してしまう（実データで発生した）。
        const kept = after.filter((t) => beforeSet.has(t)).length;
        const overlap = kept / before.length;
        if (overlap > best.overlap) {
          best = { overlap, leaked: after.filter((t) => !beforeSet.has(t)) };
        }
      } finally {
        // 差し替えは必ず戻す。戻さないと以降の診断が別の内容を見てしまう。
        pageObj.put("Contents", original);
      }
    }

    // 確信が持てなければ何も返さない。壊れた文字列を「漏れている内容」として
    // 見せるのは、残存を見逃すのと別種の害になる。
    return best.overlap >= MIN_ORPHAN_OVERLAP ? best.leaked.slice(0, MAX_RECOVERED_LINES) : [];
  }

  /**
   * 検出項目2: 孤児オブジェクトに残った原本。
   *
   * 墨消し後に garbage collection 無しで保存すると、旧 content stream が
   * どのページからも参照されないままファイル内に残る。表示にもテキスト抽出にも
   * 出てこないため、通常の確認方法では気づけない。
   */
  function findOrphans(doc: MuPDF.PDFDocument, pageCount: number): Orphan[] {
    const reachable = reachableObjects(doc);
    const total = doc.countObjects();
    const out: Orphan[] = [];

    for (let i = 1; i < total; i++) {
      if (reachable.has(i)) continue;
      // isStream()/readStream() は間接参照に対して呼ぶ（resolve() 後だと常に false）
      const ref = doc.newIndirect(i);
      if (!ref.isStream()) continue;

      let body: string;
      try {
        const buf = ref.readStream();
        body = LATIN1.decode(buf.asUint8Array());
        buf.destroy();
      } catch {
        continue; // 復号できないストリームは判定対象外
      }
      const textOps = (body.match(/\bT[jJ]\b/g) ?? []).length;
      if (textOps === 0 || !/\bBT\b/.test(body)) continue;

      out.push({
        objNum: i,
        bytes: body.length,
        textOps,
        recovered: recoverOrphanText(doc, i, pageCount),
      });
    }
    return out;
  }

  /** 文書全体の現在のテキスト行 */
  function linesOfDoc(doc: MuPDF.PDFDocument): Set<string> {
    const out = new Set<string>();
    const n = doc.countPages();
    for (let i = 0; i < n; i++) for (const t of textOfPage(doc, i)) out.add(t);
    return out;
  }

  /**
   * 検出項目2（その2）: 増分保存で残った過去の版。
   *
   * 既存のオブジェクトを同じ番号のまま書き換えて増分保存すると、孤児は生まれず、
   * 旧版はファイル前半にそのまま残る。最初の %%EOF で切れば誰でも読める。
   * 版の数だけで警告すると、Word や Acrobat が普通に出力する PDF の半数に当たる
   * （実データ 6 件中 3 件が 2〜3 版）。そこで「過去の版にあって今は無い行」が
   * 実在するときだけ報告する。
   * shortcut: 文書全体の集合差なので、消した行と同じ文字列が別の場所に残っていると拾えない。
   */
  function findPastVersionText(bytes: Uint8Array, current: Set<string>): string[] {
    const all = revisionEnds(bytes);
    // 最後の区切りの後ろに空白しか無ければ、それは今の版。%%EOF が欠けた壊れたファイルでは
    // 最後の区切りが一つ前の版になるので、無条件に捨てると見逃す
    const tail = all.length > 0 ? bytes.length - all[all.length - 1] : Infinity;
    const lastIsCurrent = tail < 1024 && /^\s*$/.test(LATIN1.decode(bytes.subarray(bytes.length - tail)));
    const past = lastIsCurrent ? all.slice(0, -1) : all;
    // 上限を超えたら最初の版は必ず残す。消される前の原文が確実に入っているのはそこだけ
    const ends = past.length > MAX_PAST_VERSIONS ? [past[0], ...past.slice(-(MAX_PAST_VERSIONS - 1))] : past;
    const joined = [...current].join("\n");
    const found = new Set<string>();
    for (const end of ends) {
      let old: MuPDF.PDFDocument | null = null;
      try {
        old = mu.PDFDocument.openDocument(bytes.slice(0, end), "application/pdf") as MuPDF.PDFDocument;
        // 行に追記しただけ・行が移動しただけのものは消えていないので数えない
        for (const t of linesOfDoc(old)) if (!current.has(t) && !joined.includes(t)) found.add(t);
      } catch {
        // 開けない途中版（線形化 PDF の先頭部分など）は対象外
      } finally {
        old?.destroy();
      }
    }
    return [...found].slice(0, MAX_RECOVERED_LINES);
  }

  /** 検出項目3: メタデータ・埋め込みファイル */
  function findMetadata(doc: MuPDF.PDFDocument) {
    const metadata: { key: string; value: string }[] = [];
    // 標準の 6 項目に限らない。Word は Company、Acrobat は SourceModified なども書く
    const infoRef = doc.getTrailer().get("Info");
    const info = infoRef.isNull() ? infoRef : infoRef.resolve(); // Null は resolve できない
    if (info.isDictionary()) {
      info.forEach((_v, k) => {
        if (typeof k !== "string" || INFO_SKIP.has(k)) return;
        const raw = doc.getMetaData(`info:${k}`);
        if (raw && raw.trim()) metadata.push({ key: k, value: decodePdfString(raw) });
      });
    }
    // Info 辞書とは別に XMP にも作成者名や元の文書名が入る。カタログだけでなく
    // ページや画像にも /Metadata を持てるので、全オブジェクトから探す
    const root = doc.getTrailer().get("Root").get("Metadata");
    const rootNum = root.isIndirect() ? root.asIndirect() : -1;
    const seen = new Set<string>();
    for (let i = 1; i < doc.countObjects(); i++) {
      const ref = doc.newIndirect(i);
      if (!ref.isStream()) continue;
      const type = ref.get("Type");
      if (!type.isName() || type.asName() !== "Metadata") continue;
      try {
        const buf = ref.readStream();
        const summary = summarizeXmp(new TextDecoder().decode(buf.asUint8Array()));
        buf.destroy();
        if (summary && !seen.has(summary)) {
          seen.add(summary);
          metadata.push({ key: i === rootNum ? "XMP" : "XMP（ページ・画像）", value: summary });
        }
      } catch {
        // 壊れた XMP は判定対象外
      }
    }
    let embeddedFiles: string[] = [];
    try {
      embeddedFiles = Object.keys(doc.getEmbeddedFiles()).map(decodePdfString);
    } catch {
      embeddedFiles = [];
    }
    return { metadata, embeddedFiles };
  }

  return function analyze(bytes: Uint8Array): Report {
    const doc = mu.PDFDocument.openDocument(bytes, "application/pdf") as MuPDF.PDFDocument;
    // 利用者パスワード付きの PDF は開けてしまうが中身は復号できず、何も見つからない。
    // そのまま進むと「検出なし」と出てしまうので、診断できないことをはっきり返す
    if (doc.needsPassword()) {
      doc.destroy();
      throw new Error(ENCRYPTED_MESSAGE);
    }
    // 孤児復元で Contents を差し替えるため、ページのキャッシュを無効にする
    doc.setPageTreeCache(false);
    let pageCount: number;
    let hiddenText: HiddenText[];
    let orphans: Orphan[];
    let pastVersionText: string[];
    let metadata: { key: string; value: string }[];
    let embeddedFiles: string[];
    try {
      pageCount = doc.countPages();
      const raw: HiddenText[] = [];
      for (let i = 0; i < pageCount; i++) raw.push(...findHiddenText(doc, i));
      hiddenText = mergeAdjacent(raw);
      const current = linesOfDoc(doc);
      orphans = findOrphans(doc, pageCount);
      // 孤児として既に表示する行は重ねて出さない
      const shown = new Set(orphans.flatMap((o) => o.recovered));
      pastVersionText = findPastVersionText(bytes, current).filter((t) => !shown.has(t));
      ({ metadata, embeddedFiles } = findMetadata(doc));
    } finally {
      doc.destroy();
    }

    // 隠しテキスト・孤児・過去の版は削除前の内容が読める状態なので danger、
    // メタデータだけなら warning に落とす。
    const verdict: Severity =
      hiddenText.length > 0 || orphans.length > 0 || pastVersionText.length > 0
        ? "danger"
        : metadata.length > 0 || embeddedFiles.length > 0
          ? "warning"
          : "clean";

    return { pageCount, hiddenText, orphans, pastVersionText, metadata, embeddedFiles, verdict };
  };
}
