"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { cx } from "@/lib/cx";
import { Brand } from "./brand";
import { Avatar } from "./avatar";

type NavItem = { href: string; label: string; match: (p: string) => boolean };

const DOCTOR_NAV: NavItem[] = [
  { href: "/appointments", label: "Приёмы", match: (p) => p === "/appointments" || (p.startsWith("/appointments/") && p !== "/appointments/new") },
  { href: "/appointments/new", label: "Новый приём", match: (p) => p === "/appointments/new" },
  { href: "/archive", label: "Архив", match: (p) => p.startsWith("/archive") },
];
const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Пользователи", match: (p) => p.startsWith("/admin/users") },
  { href: "/admin/templates", label: "Шаблоны документов", match: (p) => p.startsWith("/admin/templates") },
];

export function AppShell({
  user,
  children,
  footer,
}: {
  user: { fullName: string; roleLabel: string; position: string | null; role: "doctor" | "admin"; avatarColor: string | null };
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const nav = user.role === "admin" ? ADMIN_NAV : DOCTOR_NAV;
  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-ink bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-10 px-5 sm:px-8">
          <Link href="/" className="shrink-0">
            <Brand />
          </Link>
          <nav className="hidden h-full items-stretch gap-7 md:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "flex items-center border-b-2 pt-[2px] text-[14px] transition-colors",
                  n.match(pathname) ? "border-signal font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-5 md:flex">
            <Link href="/account" className="group flex items-center gap-3">
              <Avatar name={user.fullName} color={user.avatarColor} />
              <span className="leading-tight">
                <span
                  className={cx(
                    "block text-[13px] font-medium text-ink decoration-2 underline-offset-4 group-hover:underline",
                    pathname.startsWith("/account") && "underline decoration-signal",
                  )}
                >
                  {user.fullName}
                </span>
                <span className="kicker block text-ink-3">{user.position || user.roleLabel}</span>
              </span>
            </Link>
            <button onClick={logout} className="kicker text-ink-3 hover:text-ink">
              Выйти
            </button>
          </div>
          <button className="ml-auto text-ink md:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Закрыть меню" : "Открыть меню"}>
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-line bg-paper px-5 pb-4 md:hidden">
            {[...nav, { href: "/account", label: "Мой профиль", match: (p: string) => p.startsWith("/account") }].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cx("flex h-12 items-center border-b border-line text-[15px]", n.match(pathname) ? "font-medium text-ink" : "text-ink-2")}
              >
                {n.match(pathname) && <span className="mr-3 h-2 w-2 bg-signal" />}
                {n.label}
              </Link>
            ))}
            <button onClick={logout} className="kicker mt-4 text-ink-3">
              Выйти
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      <div className="mx-auto w-full max-w-[1240px] px-5 pb-6 sm:px-8">
        <div className="border-t border-ink pt-4">{footer}</div>
      </div>
    </div>
  );
}
