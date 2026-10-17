import { cx } from "@/lib/cx";

export const AVATAR_COLORS = ["#141414", "#c4321f", "#1f6b43", "#2b4c74", "#6b4a8a", "#8a5a1f", "#4a5560", "#7a2e3a"];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Квадратная метка с инициалами — как штамп. */
export function Avatar({ name, color, size = "md" }: { name: string; color: string | null | undefined; size?: "md" | "lg" }) {
  const fallback = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center font-mono font-medium text-sheet", size === "lg" ? "h-14 w-14 text-lg" : "h-8 w-8 text-[12px]")}
      style={{ background: color || fallback }}
    >
      {initials(name)}
    </span>
  );
}
