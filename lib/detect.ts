// 個人情報の自動検出。
//
// 設計上の前提: これは候補の提示までしか行わない。適用の可否は人が決める。
// 消し漏らしは漏えい事故、消しすぎは情報公開請求への不当な不開示であり、
// どちらもツールが独断で決めてよい範囲にない。
//
// 文字単位の quad を使うため、行全体ではなく該当部分だけを囲める
// （「氏名：山田太郎 電話：090-1234-5678」の電話番号だけを対象にできる）。
import type * as MuPDF from "mupdf";
import type { Area } from "./redact.ts";
import { SURNAMES, NAME_MIN, NAME_MAX } from "./surnames.ts";

export type CandidateKind = "phone" | "postal" | "email" | "mynumber" | "labeled" | "name" | "org";

export type Candidate = {
  id: string;
  page: number;
  kind: CandidateKind;
  /** 種別の表示名 */
  label: string;
  /** 検出された文字列。画面で確認させるために持つ（報告書には出さない） */
  text: string;
  area: Area;
};

export const KIND_LABEL: Record<CandidateKind, string> = {
  phone: "電話番号",
  postal: "郵便番号",
  email: "メールアドレス",
  mynumber: "個人番号",
  labeled: "記入欄",
  name: "氏名らしき語",
  org: "組織名",
};

type Char = { c: string; quad: number[] };

/** 補った改行の目印。座標を持たないので範囲計算からは除外する */
const NEWLINE: number[] = [];

/**
 * 組織名の接尾語。
 *
 * 既定では検出しない。組織名それ自体は個人情報ではなく、多くの文書では
 * 本文の一部として残すべきものだからである。実測でも、議事録の「日本銀行」や
 * 白書の「東京大学」のように、消してはいけないものばかりが挙がった。
 *
 * 一方で、論文の査読・内部通報・事例共有のように文書全体を匿名化したい用途では
 * 所属が準識別子になる。その場合だけ明示的に有効にする。
 */
const ORG_SUFFIX = [
  "大学院", "大学", "学院", "高等学校", "高校", "中学校", "小学校", "専門学校",
  "株式会社", "有限会社", "合同会社", "公司", "財団法人", "社団法人", "独立行政法人",
  "研究所", "研究院", "病院", "医院", "クリニック", "診療所", "薬局",
  "法律事務所", "会計事務所", "税理士事務所", "事務所",
  "市役所", "区役所", "町役場", "村役場", "県庁",
  "銀行", "信用金庫", "組合",
];

/** 漢字のみ（CJK 統合漢字と拡張A）。氏名判定に使う */
const KANJI_ONLY = /^[㐀-䶿一-鿿]+$/;

/** 組織名の頭として許す文字。仮名・記号は含めない */
const ORG_HEAD = /[㐀-䶿一-鿿A-Za-z0-9０-９]/;

/**
 * マイナンバーの検査用数字を検証する。
 * これを省くと 12 桁の数字が全て個人番号として拾われ、誤検出だらけになる。
 */
export function isValidMyNumber(s: string): boolean {
  if (!/^\d{12}$/.test(s)) return false;
  const d = [...s].map(Number);
  let sum = 0;
  for (let n = 1; n <= 11; n++) {
    const P = d[11 - n];
    const Q = n <= 6 ? n + 1 : n - 5;
    sum += P * Q;
  }
  const r = sum % 11;
  return d[11] === (r <= 1 ? 0 : 11 - r);
}

/**
 * 記入欄の項目名。
 * 日本語だけでは足りない。履歴書や名刺では中国語・英語の項目名がそのまま使われる。
 * ここに無いラベルがあると、直前のラベルの値が行末まで伸びて範囲が広がりすぎる。
 */
const LABELS = [
  // 日本語
  "氏名", "氏 名", "名前", "ふりがな", "フリガナ", "担当者", "担当", "連絡先",
  "住所", "現住所", "所在地", "電話番号", "電話", "携帯", "生年月日", "年齢",
  "性別", "国籍", "メールアドレス", "メール", "口座番号", "学籍番号", "社員番号",
  // 中国語
  "姓名", "電話", "电话", "手机", "手機", "邮箱", "郵箱", "邮件", "地址",
  "联系方式", "聯繫方式", "出生日期", "性别", "籍贯",
  // 英語
  "Name", "TEL", "Tel", "Phone", "Mobile", "Email", "E-mail", "Mail", "Address",
];

const PATTERNS: { kind: CandidateKind; re: RegExp; validate?: (s: string) => boolean }[] = [
  // メールは最も曖昧さが少ないので先に確定させる
  { kind: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+\w/g },
  // 国際形式（+81-90-… / +86 138…）
  { kind: "phone", re: /\+\d{1,3}[-‐−－\s]?\d{1,4}[-‐−－\s]?\d{3,4}[-‐−－\s]?\d{3,4}/g },
  // 日本の区切りあり。市外局番 2-5 桁 + 市内局番 + 加入者番号
  { kind: "phone", re: /0\d{1,4}[-‐−ー－]\d{1,4}[-‐−ー－]\d{3,4}/g },
  // 区切り無し。日本の携帯 11 桁 / 固定 10 桁、中国の携帯 11 桁。
  // 前後が数字でないことを要求して、長い番号列の一部を切り出さないようにする。
  { kind: "phone", re: /(?<!\d)(?:0[789]0\d{8}|0\d{9}|1[3-9]\d{9})(?!\d)/g },
  { kind: "postal", re: /〒\s?\d{3}[-‐−ー－]?\d{4}|(?<!\d)\d{3}[-‐−ー－]\d{4}(?!\d)/g },
  { kind: "mynumber", re: /(?<!\d)\d{12}(?!\d)/g, validate: isValidMyNumber },
];

function quadsToArea(page: number, all: Char[]): Area {
  const chars = all.filter((c) => c.quad.length === 8);
  const xs = chars.flatMap((c) => [c.quad[0], c.quad[2], c.quad[4], c.quad[6]]);
  const ys = chars.flatMap((c) => [c.quad[1], c.quad[3], c.quad[5], c.quad[7]]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  // 描画の縁が僅かに外へ出るため少し広げる。狭いと文字の端が残る
  const pad = 1;
  return {
    page,
    x: x - pad,
    y: y - pad,
    w: Math.max(...xs) - x + pad * 2,
    h: Math.max(...ys) - y + pad * 2,
  };
}

export type DetectOptions = {
  /**
   * 組織名・学校名も候補に含める。既定は false。
   * 文書全体を匿名化する用途でのみ有効にする。
   */
  includeOrganizations?: boolean;
};

export type DetectResult = {
  candidates: Candidate[];
  /**
   * 埋め込まれた画像の数。
   * 顔写真・印影・スキャンされた署名は画像であり、テキストとしては検出できない。
   * 自動検出だけで済ませてしまうのを防ぐため、件数を返して注意を促す。
   */
  imageCount: number;
};

/** ページ資源から画像 XObject を数える。Form 内の入れ子までは追わない */
function countImages(doc: MuPDF.PDFDocument, pageIndex: number): number {
  try {
    const res = doc.findPage(pageIndex).getInheritable("Resources");
    if (!res.isDictionary()) return 0;
    const xo = res.get("XObject");
    if (!xo.isDictionary()) return 0;
    let n = 0;
    xo.forEach((v) => {
      const sub = v.resolve().get("Subtype");
      if (sub.isName() && sub.asName() === "Image") n++;
    });
    return n;
  } catch {
    return 0;
  }
}

export function createDetector(mu: typeof MuPDF) {
  return function detect(bytes: Uint8Array, options: DetectOptions = {}): DetectResult {
    const doc = mu.PDFDocument.openDocument(bytes, "application/pdf") as MuPDF.PDFDocument;
    const out: Candidate[] = [];
    let seq = 0;

    const pageCount = doc.countPages();
    let imageCount = 0;
    for (let page = 0; page < pageCount; page++) {
      imageCount += countImages(doc, page);
      const chars: Char[] = [];
      // walk は行の区切りを文字として返さないため、字の上端 y の変化から改行を補う。
      // これが無いと「住所：…」の値が次の行まで繋がって読まれ、囲む範囲が
      // 二行にまたがってしまう（消しすぎは消し漏らしと同じく事故になる）。
      let lastY: number | null = null;
      // destroy を怠ると WASM ヒープに残り続ける
      const pg = doc.loadPage(page);
      const stext = pg.toStructuredText("preserve-whitespace");
      stext.walk({
          onChar(c: string, _o: unknown, _f: unknown, _s: number, quad: number[]) {
            const y = quad[1];
            if (lastY !== null && Math.abs(y - lastY) > 2) {
              chars.push({ c: "\n", quad: NEWLINE });
            }
            lastY = y;
            chars.push({ c, quad });
          },
      } as never);
      stext.destroy();
      pg.destroy();

      const text = chars.map((x) => x.c).join("");
      const taken: boolean[] = new Array(chars.length).fill(false);

      const push = (kind: CandidateKind, start: number, end: number, shown: string) => {
        // 既に別の規則で拾った範囲は重ねない
        if (taken.slice(start, end).some(Boolean)) return;
        const slice = chars.slice(start, end);
        if (!slice.some((c) => c.quad.length === 8)) return;
        for (let i = start; i < end; i++) taken[i] = true;
        out.push({
          id: `c${seq++}`,
          page,
          kind,
          label: KIND_LABEL[kind],
          text: shown.trim(),
          area: quadsToArea(page, slice),
        });
      };

      // 1) 書式が明確なものを先に確定させる。
      //    ラベル照合を先に走らせると「電話：13800138000 邮箱：xxx@example.com」の
      //    値が行末まで伸び、メールアドレスまで一つの範囲に飲み込まれる。
      for (const { kind, re, validate } of PATTERNS) {
        re.lastIndex = 0;
        for (let m = re.exec(text); m; m = re.exec(text)) {
          const raw = m[0];
          if (validate && !validate(raw.replace(/\D/g, ""))) continue;
          push(kind, m.index, m.index + raw.length, raw);
        }
      }

      // 2) 見出し・署名としての氏名。
      //    履歴書や名刺では氏名にラベルが付かず、単独の行として置かれる。
      //    誤検出を抑えるため、行全体が氏名として妥当な長さの場合だけ姓を照合する。
      //    行の途中にある氏名はラベル照合か手動指定に任せる。
      let lineStart = 0;
      for (let i = 0; i <= text.length; i++) {
        if (i < text.length && text[i] !== "\n") continue;
        const line = text.slice(lineStart, i);
        const trimmed = line.trim();
        lineStart = i + 1;
        if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) continue;
        // 氏名は漢字のみで構成される。仮名や記号が混じるものは語句であって氏名ではない
        // （「方針の企業」のように一字姓で始まる語を拾ってしまうのを防ぐ）。
        if (!KANJI_ONLY.test(trimmed)) continue;
        if (!SURNAMES.some((sur) => trimmed.startsWith(sur))) continue;
        const at = lineStart - 1 - line.length + line.indexOf(trimmed);
        push("name", at, at + trimmed.length, trimmed);
      }

      // 3) 組織名（任意）。既定では走らせない
      if (options.includeOrganizations) {
        for (const suf of ORG_SUFFIX) {
          let from = 0;
          for (;;) {
            const at = text.indexOf(suf, from);
            if (at < 0) break;
            from = at + suf.length;
            // 接尾語の直後に漢字が続く場合はより長い語の一部。
            // 「全国大学生」から「全国大学」を切り出してしまうのを防ぐ。
            const next = text[at + suf.length];
            if (next && KANJI_ONLY.test(next)) continue;
            // 接尾語の前を遡って組織名の頭を探す
            let start = at;
            while (start > 0 && ORG_HEAD.test(text[start - 1]) && at - start < 12) start--;
            if (at - start < 2) continue;
            push("org", start, at + suf.length, text.slice(start, at + suf.length));
          }
        }
      }

      // 4) 記入欄。ラベルの直後から、次のラベルか行末までを対象にする
      for (const label of LABELS) {
        let from = 0;
        for (;;) {
          const at = text.indexOf(label, from);
          if (at < 0) break;
          from = at + label.length;
          const after = text.slice(from);
          const sep = after.match(/^\s*[:：]\s*/);
          if (!sep) continue; // 「氏名」単体の見出しは対象外
          const valueStart = from + sep[0].length;
          // 値の終わり: 空白（全角は 1 つでも区切りとみなす）、改行、または次のラベル
          const rest = text.slice(valueStart);
          const stop = rest.search(
            new RegExp(
              `[\\n\\r　]|[ ]{2,}|(?:${LABELS.map((l) =>
                l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s/g, "\\s*"),
              ).join("|")})\\s*[:：]`,
            ),
          );
          const value = (stop < 0 ? rest : rest.slice(0, stop)).replace(/[ 　]+$/, "");
          if (!value.trim() || value.trim().length > 40) continue;
          push("labeled", valueStart, valueStart + value.length, value);
        }
      }
    }

    doc.destroy();
    // ページ順・出現順に並べ直す（規則ごとに走査したため順序が乱れている）
    out.sort((a, b) => a.page - b.page || a.area.y - b.area.y || a.area.x - b.area.x);
    return { candidates: out, imageCount };
  };
}
