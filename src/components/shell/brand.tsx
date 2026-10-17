import { cx } from "@/lib/cx";

/** Знак продукта: звуковая волна, переходящая в строки текста. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className={cx("h-[22px] w-[22px]", className)}>
      <path d="M3 9.5v3M6.5 6v10M10 8.5v5" />
      <path d="M14 7h5M14 11h5M14 15h3" />
    </svg>
  );
}

export function Brand({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={tone === "light" ? "text-[#9fb6d3]" : "text-brand-600"} />
      <span className={cx("text-[15px] font-semibold tracking-[-0.01em]", tone === "light" ? "text-white" : "text-ink")}>МедПротокол</span>
    </span>
  );
}
