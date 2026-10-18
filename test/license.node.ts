// ライセンスの検証。
// 改竄が通ってしまうと課金の意味が無くなるので、そこを重点的に確認する。
import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { verifyLicense, LICENSE_PREFIX } from "../lib/license.ts";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const issue = (...args: string[]) =>
  execFileSync("node", ["scripts/issue-license.mjs", ...args], { encoding: "utf8" })
    .split("\n")
    .find((l) => l.startsWith(LICENSE_PREFIX))!
    .trim();

// ── 正規のライセンス ───────────────────────────────
const key = issue("山田税理士事務所");
console.log(`発行: ${key.slice(0, 48)}…（${key.length} 文字）\n`);

const lic = await verifyLicense(key);
check("正規のライセンスを受理", lic !== null);
check("組織名を復元", lic?.org === "山田税理士事務所", lic?.org);
check("プランを復元", lic?.plan === "buyout", lic?.plan);
check("席数の既定は1", lic?.seats === 1, String(lic?.seats));
check("長さが現実的", key.length < 240, `${key.length} 文字`);

const orgKey = issue("◯◯市 総務課", "--plan", "org", "--seats", "5");
const orgLic = await verifyLicense(orgKey);
check("組織ライセンスを受理", orgLic?.plan === "org" && orgLic.seats === 5);

// ── 改竄・不正 ────────────────────────────────────
const [bodyPart, sigPart] = key.slice(LICENSE_PREFIX.length).split(".");

// 組織名を書き換えた本文に、元の署名を付ける
const tampered =
  LICENSE_PREFIX +
  Buffer.from(JSON.stringify({ o: "別の事務所", s: 999, i: "2026-08-27", p: "org" }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "") +
  "." +
  sigPart;
check("本文の改竄を拒否", (await verifyLicense(tampered)) === null);

const badSig = LICENSE_PREFIX + bodyPart + "." + sigPart.slice(0, -4) + "AAAA";
check("署名の改竄を拒否", (await verifyLicense(badSig)) === null);

check("接頭辞なしを拒否", (await verifyLicense(key.slice(LICENSE_PREFIX.length))) === null);
check("空文字を拒否", (await verifyLicense("")) === null);
check("でたらめな文字列を拒否", (await verifyLicense(LICENSE_PREFIX + "abc.def")) === null);
// 別人が自前の鍵で発行したライセンスを弾けること。
// ここが通ると誰でも無限に発行できてしまうので、実質これが一番重要な検査。
{
  const other = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const b = new TextEncoder().encode(
    JSON.stringify({ o: "偽造事務所", s: 99, i: "2026-08-27", p: "org" }),
  );
  const s = new Uint8Array(
    await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, other.privateKey, b),
  );
  const enc = (x: Uint8Array) =>
    Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const forged = `${LICENSE_PREFIX}${enc(b)}.${enc(s)}`;
  check("別の鍵で署名されたものを拒否", (await verifyLicense(forged)) === null);
}

// 空白・改行が混ざっても通ること（メールから貼り付ける想定）
check(
  "改行込みの貼り付けを受理",
  (await verifyLicense(`  ${key.slice(0, 40)}\n${key.slice(40)}  `))?.org === "山田税理士事務所",
);

console.log(`\n${failed === 0 ? "全チェック PASS" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
