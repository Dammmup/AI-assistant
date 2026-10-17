import { cx } from "@/lib/cx";

export const AVATAR_COLORS = ["#2b4c74", "#3b6e5a", "#7a4e2d", "#6a3f6e", "#8a2f3c", "#40566b", "#5b6a2e", "#2f5f6e"];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function Avatar({ name, color, size = "md" }: { name: string; color: string | null | undefined; size?: "md" | "lg" }) {
  const fallback = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "lg" ? "h-14 w-14 text-lg" : "h-8 w-8 text-xs",
      )}
      style={{ background: color || fallback }}
    >
      {initials(name)}
    </span>
  );
}
