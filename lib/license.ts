// ライセンスの検証。
//
// アカウントもサーバーも持たない設計のため、署名付きの文字列そのものを鍵にする。
// 秘密鍵で署名し、内蔵の公開鍵でブラウザ内だけで検証する。通信は発生しない
// （庁内ネットワークから外へ出られない環境でも動くことが要件）。
//
// 転売・共有への抑止は技術ではなく社会的なものに置いている。
// ライセンスに刻まれた組織名は画面と処理報告書に印字されるため、
// 他所に渡せば相手の報告書に自組織名が載る。

const PUBLIC_KEY: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "nMs02YGbfYOgV907VukN_CobL-YcE7P-Rno0HoOYgLE",
  y: "SaTu1sqqbPpJKjXjXurQ9AdfG4OH4dr1lXg9jPVf5QI",
};

export type Plan = "buyout" | "org";

/** 署名対象。短くするため 1 文字のキーを使う */
type Payload = { o: string; s: number; i: string; p: Plan };

export type License = {
  /** 組織名または氏名。画面と報告書に表示する */
  org: string;
  seats: number;
  issuedAt: string;
  plan: Plan;
};

export const PLAN_LABEL: Record<Plan, string> = {
  buyout: "買い切りライセンス",
  org: "組織ライセンス",
};

const b64uToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export const bytesToB64u = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** 表示・入力用の整形。実体は 2 つの base64url を "." で繋いだもの */
export const LICENSE_PREFIX = "SUMI1-";

/**
 * 検証する。改竄・書式不正・未知の形式はすべて null を返す。
 * 期限は持たせていない（買い切りのため）。
 */
export async function verifyLicense(input: string): Promise<License | null> {
  try {
    const raw = input.trim().replace(/\s+/g, "");
    if (!raw.startsWith(LICENSE_PREFIX)) return null;
    const [body, sig] = raw.slice(LICENSE_PREFIX.length).split(".");
    if (!body || !sig) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      PUBLIC_KEY,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64uToBytes(sig) as unknown as BufferSource,
      b64uToBytes(body) as unknown as BufferSource,
    );
    if (!ok) return null;

    const p = JSON.parse(new TextDecoder().decode(b64uToBytes(body))) as Payload;
    if (!p.o || !p.p) return null;
    return { org: p.o, seats: p.s ?? 1, issuedAt: p.i, plan: p.p };
  } catch {
    return null;
  }
}

const STORAGE_KEY = "sumikeshi.license";

export function storeLicense(raw: string) {
  try {
    localStorage.setItem(STORAGE_KEY, raw.trim());
  } catch {
    // プライベートモード等で書けない場合はその場限りの利用になる
  }
}

export function loadStoredLicense(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearLicense() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
}
