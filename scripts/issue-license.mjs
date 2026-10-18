// ライセンスを発行する。購入者に渡す文字列を出力する。
//
//   node scripts/issue-license.mjs "山田税理士事務所"
//   node scripts/issue-license.mjs "◯◯市 総務課" --plan org --seats 5
//
// 組織名は購入者の申告どおりに入れる。この名前が相手の処理報告書に印字される。
import { webcrypto as crypto } from "node:crypto";
import { readFileSync, existsSync, appendFileSync } from "node:fs";

const PRIV = ".keys/license-private.jwk.json";
const LEDGER = ".keys/issued.log";
const PREFIX = "SUMI1-";

const args = process.argv.slice(2);
const org = args.find((a) => !a.startsWith("--"));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (!org) {
  console.error('使い方: node scripts/issue-license.mjs "組織名" [--plan buyout|org] [--seats 1]');
  process.exit(1);
}
if (!existsSync(PRIV)) {
  console.error(`${PRIV} がありません。先に node scripts/keygen.mjs を実行してください。`);
  process.exit(1);
}

const plan = opt("plan", "buyout");
const seats = Number(opt("seats", plan === "org" ? "5" : "1"));
if (!["buyout", "org"].includes(plan)) {
  console.error("--plan は buyout か org のいずれかです。");
  process.exit(1);
}

const b64u = (b) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const payload = { o: org, s: seats, i: new Date().toISOString().slice(0, 10), p: plan };
const body = new TextEncoder().encode(JSON.stringify(payload));

const key = await crypto.subtle.importKey(
  "jwk",
  JSON.parse(readFileSync(PRIV, "utf8")),
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
);
const sig = new Uint8Array(
  await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, body),
);

const license = `${PREFIX}${b64u(body)}.${b64u(sig)}`;

// 誰に何を出したかを追えるようにしておく（再発行の依頼が来る）
appendFileSync(LEDGER, `${new Date().toISOString()}\t${plan}\t${seats}\t${org}\t${license}\n`);

console.log(`\n発行しました  ${org} / ${plan} / ${seats}席\n`);
console.log(license);
console.log(`\n（${LEDGER} に記録しました）`);
