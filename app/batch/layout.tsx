// page.tsx は "use client" のため metadata を持てない。ルート単位の layout で補う。
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "一括診断 — 公開済みの PDF をまとめて点検する",
  description:
    "複数の PDF をまとめて診断し、どのファイルに問題があるかを一覧にします。既に公開済みの文書を後から点検する用途に。結果は CSV で書き出せます。",
};

export default function BatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
