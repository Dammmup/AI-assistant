import Link from "next/link";
import { cx } from "@/lib/cx";

export function SiteFooter({ className }: { className?: string; tone?: "dark" | "light" }) {
  const year = new Date().getFullYear();
  return (
    <footer className={cx("no-print flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.06em] text-ink-3 uppercase", className)}>
      <span>© {year} МедПротокол. Все права защищены.</span>
      <Link href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
        Политика конфиденциальности
      </Link>
    </footer>
  );
}
