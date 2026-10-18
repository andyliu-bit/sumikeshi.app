// ライセンス署名用の鍵ペアを一度だけ生成する。
//
// 秘密鍵は .keys/ に置き、リポジトリには入れない（.gitignore 済み）。
// **必ず別の場所にも控えを取ること。** 失うと新しいライセンスを発行できなくなる
// （発行済みのライセンスは公開鍵が変わらない限り有効なまま）。
import { webcrypto as crypto } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const DIR = ".keys";
const PRIV = `${DIR}/license-private.jwk.json`;

if (existsSync(PRIV)) {
  console.error(`${PRIV} が既に存在します。上書きすると発行済みライセンスが検証できなくなります。`);
  console.error("作り直す場合は手動で削除してください。");
  process.exit(1);
}

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);

mkdirSync(DIR, { recursive: true });
writeFileSync(PRIV, JSON.stringify(priv, null, 2));

console.log(`秘密鍵を ${PRIV} に保存しました。控えを取ってください。\n`);
console.log("公開鍵。lib/license.ts の PUBLIC_KEY に貼り付けてください:\n");
console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, null, 2));
