"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-900 disabled:bg-brand-600/45",
  secondary: "bg-white text-ink border border-line-2 hover:border-ink-3 hover:bg-paper disabled:text-ink-3 disabled:hover:border-line-2",
  danger: "bg-[#a3322a] text-white hover:bg-[#8a2922] disabled:bg-[#a3322a]/45",
  ghost: "text-ink-2 hover:bg-black/[0.04] hover:text-ink disabled:text-ink-3",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/** Раздел страницы: заголовок слева, действия справа, содержимое под тонкой линией. */
export function Card({
  title,
  actions,
  children,
  className,
  subtitle,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-md border border-line bg-white", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

const TONES = {
  gray: { box: "bg-[#efede7] text-ink-2", dot: "bg-ink-3" },
  blue: { box: "bg-brand-50 text-brand-700", dot: "bg-brand-500" },
  green: { box: "bg-[#e9f2ec] text-[#22573a]", dot: "bg-[#3b8a5c]" },
  yellow: { box: "bg-[#f7efdc] text-[#7a5410]", dot: "bg-[#c48a1d]" },
  red: { box: "bg-[#f6e6e3] text-[#8a2922]", dot: "bg-[#b9443a]" },
  brand: { box: "bg-brand-50 text-brand-700", dot: "bg-brand-600" },
  violet: { box: "bg-[#eeeaf4] text-[#4f3b78]", dot: "bg-[#7a62a8]" },
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, title, dot = true }: { tone?: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span
      title={title}
      className={cx("inline-flex h-[22px] items-center gap-1.5 rounded-[4px] px-1.5 text-xs font-medium whitespace-nowrap", TONES[tone].box)}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", TONES[tone].dot)} />}
      {children}
    </span>
  );
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-2">
      <span>{children}</span>
      {hint && <span className="font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

const field =
  "w-full rounded-[5px] border border-line-2 bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3/80 transition-colors hover:border-ink-3 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(61,99,144,0.14)] disabled:bg-paper disabled:text-ink-3";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(field, "h-9", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(field, "leading-relaxed", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(field, "h-9 py-0 pr-8", props.className)} />;
}

export function Alert({ tone = "red", children }: { tone?: "red" | "yellow" | "blue" | "green"; children: ReactNode }) {
  const map = {
    red: "border-l-[#b9443a] bg-[#fbf1ef] text-[#7c2620]",
    yellow: "border-l-[#c48a1d] bg-[#fbf6ea] text-[#6b4a0e]",
    blue: "border-l-brand-500 bg-brand-50 text-brand-900",
    green: "border-l-[#3b8a5c] bg-[#eff6f1] text-[#1f4f35]",
  };
  return <div className={cx("rounded-r-[4px] border-l-[3px] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line", map[tone])}>{children}</div>;
}

/** Заголовок страницы. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export { cx };
