// page.tsx は "use client" のため metadata を持てない。ルート単位の layout で補う。
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF墨消しツール — 文字データごと削除して、消えたことを確認する",
  description:
    "黒い四角を重ねるのではなく、文字データそのものを削除します。個人情報の自動検出、処理後の自動検証、監査用の処理報告書に対応。ファイルはブラウザ内で処理され、サーバーには送信されません。",
};

export default function RedactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
