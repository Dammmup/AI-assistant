"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-sheet border border-ink hover:bg-[#2c2b28] disabled:bg-ink/35 disabled:border-transparent",
  secondary: "border border-ink text-ink bg-transparent hover:bg-ink hover:text-sheet disabled:border-line-2 disabled:text-ink-3 disabled:hover:bg-transparent",
  danger: "bg-signal text-white border border-signal hover:bg-[#a5291a] disabled:opacity-45",
  ghost: "text-ink-2 border border-transparent underline-offset-[5px] decoration-1 hover:text-ink hover:underline disabled:text-ink-3 disabled:no-underline",
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
        "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors duration-100 disabled:cursor-not-allowed",
        variant === "ghost" ? (size === "sm" ? "h-8 px-1.5 text-[13px]" : "h-9 px-2 text-sm") : size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-5 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <span className="h-3 w-3 animate-spin border-[1.5px] border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/**
 * Раздел бланка: номер и заголовок над толстой линейкой, содержимое без рамки.
 * sheet — содержимое на «листе» (белый лист с рамкой), например для документа.
 */
export function Card({
  title,
  actions,
  children,
  className,
  subtitle,
  index,
  sheet,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  index?: string;
  sheet?: boolean;
}) {
  return (
    <section className={cx("border-t-2 border-ink", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 pt-3 pb-4">
          <div className="flex min-w-0 items-baseline gap-4">
            {index && <span className="kicker text-ink-3">{index}</span>}
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold tracking-[0.08em] text-ink uppercase">{title}</h2>
              {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actions}</div>}
        </header>
      )}
      <div className={cx(sheet ? "border border-line-2 bg-sheet px-6 py-5 shadow-[3px_3px_0_0_rgba(20,20,20,0.06)]" : "pb-2", index && !sheet && "md:pl-9")}>{children}</div>
    </section>
  );
}

const TONES = {
  gray: "text-ink-3 [--mark:var(--color-line-2)]",
  blue: "text-ink-2 [--mark:var(--color-ink-2)]",
  green: "text-ok [--mark:var(--color-ok)]",
  yellow: "text-warn [--mark:#c48a1d]",
  red: "text-signal [--mark:var(--color-signal)]",
  brand: "text-ink [--mark:var(--color-ink)]",
  violet: "text-ink-2 [--mark:#6b5a92]",
} as const;
export type Tone = keyof typeof TONES;

/** Отметка статуса: квадратный маркер и моноширинная подпись. */
export function Badge({ tone = "gray", children, title, dot = true }: { tone?: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] whitespace-nowrap uppercase", TONES[tone])}>
      {dot && <span className="h-[7px] w-[7px] bg-[var(--mark)]" />}
      {children}
    </span>
  );
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-baseline justify-between gap-2">
      <span className="kicker text-ink-2">{children}</span>
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

/** Поле бланка: только линия снизу. */
const lineField =
  "w-full border-0 border-b border-line-2 bg-transparent px-0 text-[15px] text-ink outline-none placeholder:text-ink-3/70 transition-[border-color,box-shadow] hover:border-ink-3 focus:border-ink focus:shadow-[inset_0_-1px_0_var(--color-ink)] disabled:text-ink-3 disabled:hover:border-line-2";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(lineField, "h-10", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full border border-line-2 bg-sheet px-3 py-2.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3/70 hover:border-ink-3 focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)] disabled:bg-transparent disabled:text-ink-3",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(lineField, "select-arrow h-10 cursor-pointer pr-6", props.className)} />;
}

export function Alert({ tone = "red", children }: { tone?: "red" | "yellow" | "blue" | "green"; children: ReactNode }) {
  const map = {
    red: "border-signal text-[#7d2014]",
    yellow: "border-[#c48a1d] text-[#6b4a0e]",
    blue: "border-ink text-ink-2",
    green: "border-ok text-[#174d31]",
  };
  return <div className={cx("border-l-2 bg-sheet/70 py-2 pr-3 pl-3 text-[14px] leading-relaxed whitespace-pre-line", map[tone])}>{children}</div>;
}

/** Заголовок страницы: подпись раздела, крупный заголовок с засечками, линейка. */
export function PageHeader({ title, description, actions, kicker }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-5">
      <div>
        {kicker && <p className="kicker mb-2 text-ink-3">{kicker}</p>}
        <h1 className="font-serif text-[34px] leading-[1.1] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        {description && <p className="mt-2 text-[15px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export { cx };
