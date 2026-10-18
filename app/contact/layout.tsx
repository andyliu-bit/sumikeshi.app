// page.tsx は "use client" のため metadata を持てない。ルート単位の layout で補う。
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お問い合わせ・見積り依頼",
  description:
    "組織での導入相談、見積りのご依頼を承ります。請求書払い、年度予算での購入に対応します。",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
