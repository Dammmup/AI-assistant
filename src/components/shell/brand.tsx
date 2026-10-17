import { cx } from "@/lib/cx";

/** Знак: медицинский крест, перекладина которого продолжается строками протокола. */
export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  const fg = inverted ? "#fffffd" : "#141414";
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cx("h-6 w-6", className)}>
      <rect x="6" y="6" width="5" height="20" fill={fg} />
      <rect x="1" y="13.5" width="15" height="5" fill={fg} />
      <rect x="19" y="13.5" width="11" height="5" fill="#c4321f" />
      <rect x="19" y="7" width="11" height="2.5" fill={fg} />
      <rect x="19" y="22.5" width="7" height="2.5" fill={fg} />
    </svg>
  );
}

export function Brand({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <BrandMark inverted={tone === "light"} />
      <span className={cx("font-serif text-[19px] leading-none font-semibold tracking-[-0.01em]", tone === "light" ? "text-sheet" : "text-ink")}>
        МедПротокол
      </span>
    </span>
  );
}
