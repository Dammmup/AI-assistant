import Link from "next/link";
import { cx } from "@/lib/cx";

export function SiteFooter({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const year = new Date().getFullYear();
  return (
    <footer
      className={cx(
        "no-print flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]",
        tone === "light" ? "text-[#8b95a5]" : "text-ink-3",
        className,
      )}
    >
      <span>© {year} МедПротокол. Все права защищены.</span>
      <Link href="/privacy" className={cx("underline-offset-4 hover:underline", tone === "light" ? "hover:text-white" : "hover:text-ink")}>
        Политика конфиденциальности
      </Link>
    </footer>
  );
}
