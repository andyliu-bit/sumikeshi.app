// 独自ドメイン取得後に NEXT_PUBLIC_SITE_URL を設定する。
// sitemap / robots / metadataBase / OGP が全てここを見る。
export const SITE = {
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  name: "PDF墨消しチェッカー",
} as const;

/**
 * 事業者情報。
 *
 * ここは実在の情報でなければならない。プライバシーポリシーの連絡先として、
 * また課金を開始する場合は特定商取引法に基づく表記の法定記載事項として使われる。
 * 公開前に必ず実際の値へ差し替えること。未設定のまま公開してはいけない。
 */
// `??` ではなく `||` を使う。.env に空の変数（NEXT_PUBLIC_OPERATOR_NAME=）を
// 書いた場合、空文字は nullish ではないため `??` では既定値に落ちず、
// 未設定なのに OPERATOR_CONFIGURED が true になり警告が消える。
export const OPERATOR = {
  name: process.env.NEXT_PUBLIC_OPERATOR_NAME || "（運営者名を設定してください）",
  address: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS || "（所在地を設定してください）",
  email: process.env.NEXT_PUBLIC_OPERATOR_EMAIL || "（連絡先メールアドレスを設定してください）",
  phone: process.env.NEXT_PUBLIC_OPERATOR_PHONE || "（電話番号を設定してください）",
} as const;

/**
 * 買い切りライセンスの購入ページ。Gumroad / BOOTH / Lemon Squeezy などの商品 URL。
 * 未設定の間は画面に「販売準備中」と出る（存在しないリンクを踏ませない）。
 */
export const PURCHASE_URL = process.env.NEXT_PUBLIC_PURCHASE_URL ?? "";

/** 事業者情報が未設定のまま本番公開されるのを検知する */
export const OPERATOR_CONFIGURED = !OPERATOR.name.startsWith("（");

/**
 * 所在地は無料提供のみの間は表示義務がない（特定商取引法の表記義務は
 * 有料販売を始めた時点で発生する）。未設定のときは既定値をそのまま出さず、
 * 行ごと省く。中途半端な「設定してください」を公開面に出さないため。
 */
export const ADDRESS_CONFIGURED = !OPERATOR.address.startsWith("（");
