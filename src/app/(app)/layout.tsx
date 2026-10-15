import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { LogoutButton } from "@/components/logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const nav =
    user.role === "admin"
      ? [
          { href: "/admin/users", label: "Пользователи" },
          { href: "/admin/templates", label: "Шаблоны документов" },
        ]
      : [
          { href: "/appointments", label: "Приёмы" },
          { href: "/appointments/new", label: "Новый приём" },
          { href: "/archive", label: "Архив" },
        ];
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">М</span>
            МедПротокол
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-right leading-tight">
              <span className="block font-medium">{user.fullName}</span>
              <span className="block text-xs text-slate-500">{ROLE_LABEL[user.role]}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
