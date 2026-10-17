"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Archive, ClipboardList, FileText, LogOut, Menu, Plus, UserRound, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { cx } from "../ui";
import { Brand } from "./brand";
import { Avatar } from "./avatar";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; exact?: boolean };

const DOCTOR_NAV: NavItem[] = [
  { href: "/appointments", label: "Приёмы", icon: ClipboardList, exact: true },
  { href: "/appointments/new", label: "Новый приём", icon: Plus },
  { href: "/archive", label: "Архив", icon: Archive },
];
const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/templates", label: "Шаблоны документов", icon: FileText },
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
  const isActive = (n: NavItem) =>
    n.exact ? pathname === n.href || (pathname.startsWith("/appointments/") && pathname !== "/appointments/new") : pathname.startsWith(n.href);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-5">
        <Link href="/">
          <Brand tone="light" />
        </Link>
        <button className="text-[#8b95a5] hover:text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 px-3">
        {nav.map((n) => {
          const active = isActive(n);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "relative flex h-9 items-center gap-3 rounded-[5px] px-3 text-[14px] transition-colors",
                active ? "bg-white/[0.08] text-white" : "text-[#a7b0be] hover:bg-white/[0.04] hover:text-white",
              )}
            >
              {active && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-[#9fb6d3]" />}
              <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/[0.07] p-3">
        <Link
          href="/account"
          className={cx(
            "flex items-center gap-3 rounded-[5px] px-2 py-2 transition-colors",
            pathname.startsWith("/account") ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
          )}
        >
          <Avatar name={user.fullName} color={user.avatarColor} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium text-white">{user.fullName}</span>
            <span className="block truncate text-xs text-[#8b95a5]">{user.position || user.roleLabel}</span>
          </span>
          <UserRound className="h-4 w-4 text-[#8b95a5]" strokeWidth={1.75} />
        </Link>
        <button
          onClick={async () => {
            await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
            window.location.href = "/login";
          }}
          className="mt-1 flex h-8 w-full items-center gap-3 rounded-[5px] px-3 text-[13px] text-[#8b95a5] hover:bg-white/[0.04] hover:text-white"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 bg-sidebar lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar shadow-xl">{sidebar}</aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-paper/95 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Открыть меню" className="text-ink-2">
          <Menu className="h-5 w-5" />
        </button>
        <Brand />
      </header>
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
        <div className="mx-auto w-full max-w-[1180px] px-4 pb-6 sm:px-8">
          <div className="border-t border-line pt-4">{footer}</div>
        </div>
      </div>
    </div>
  );
}
