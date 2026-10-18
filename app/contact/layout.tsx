// page.tsx は "use client" のため metadata を持てない。ルート単位の layout で補う。
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "不具合や誤検出の報告、ご意見を受け付けています。本ツールはすべての機能を無料で提供しています。",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
