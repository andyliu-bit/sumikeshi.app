// 規約・ポリシー系ページの共通レイアウト。
// 読まれる前提で組む（自治体・法務の担当者は実際に読んで稟議に添付する）。
import type { ReactNode } from "react";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">最終改定: {updated}</p>
      <div className="mt-8 space-y-4">{children}</div>
    </div>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="pt-4 text-md font-bold text-ink">{children}</h2>;
}

export function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`prose-width leading-relaxed text-muted ${className}`}>{children}</p>;
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="prose-width space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 leading-relaxed text-muted">
          <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
