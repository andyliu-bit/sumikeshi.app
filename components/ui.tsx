// 全画面で共通の操作語彙。同じ役割のものが画面ごとに違う見た目になるのを防ぐ。
import Link from "@/lib/link.tsx";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "transition-[background-color,border-color,color] duration-150 ease-out-quart " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover " +
    "border border-transparent",
  secondary:
    "bg-bg text-ink border border-line-strong hover:bg-surface active:bg-surface-2",
  ghost: "bg-transparent text-muted border border-transparent hover:text-ink hover:bg-surface",
  danger: "bg-danger text-white hover:brightness-95 active:brightness-90 border border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {children}
    </Link>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/** 状態は「記号 + 語 + 色」の三重で示す。色覚に依存させない。 */
export type Tone = "ok" | "warn" | "bad" | "neutral";

const TONE_STYLE: Record<Tone, string> = {
  ok: "bg-primary-soft text-primary border-primary/25",
  warn: "bg-warning-soft text-[oklch(0.42_0.11_70)] border-warning/30",
  bad: "bg-danger-soft text-danger border-danger/25",
  neutral: "bg-surface text-muted border-line",
};

const TONE_MARK: Record<Tone, string> = { ok: "✓", warn: "!", bad: "✕", neutral: "–" };

export function Badge({
  tone = "neutral",
  mark = true,
  children,
}: {
  tone?: Tone;
  mark?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold ${TONE_STYLE[tone]}`}
    >
      {mark && <span aria-hidden>{TONE_MARK[tone]}</span>}
      {children}
    </span>
  );
}

/** 情報の区切り。カードを積むのではなく、罫線で段を作る */
export function Section({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-line pt-8 ${className}`}>
      {title && <h2 className="text-xl font-bold text-ink">{title}</h2>}
      {description && (
        <p className="prose-width mt-2 leading-relaxed text-muted">{description}</p>
      )}
      <div className={title || description ? "mt-6" : ""}>{children}</div>
    </section>
  );
}

/** 中身が主役の枠。装飾しない */
export function Panel({
  children,
  className = "",
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  const border =
    tone === "bad"
      ? "border-danger/30 bg-danger-soft"
      : tone === "warn"
        ? "border-warning/30 bg-warning-soft"
        : tone === "ok"
          ? "border-primary/25 bg-primary-soft"
          : "border-line bg-surface";
  return <div className={`rounded-lg border p-5 ${border} ${className}`}>{children}</div>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="prose-width rounded-md border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
      {children}
    </p>
  );
}
