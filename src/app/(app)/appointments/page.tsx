import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/labels";
import type { AppointmentStatus } from "@/lib/types";
import { AppointmentStatusBadge } from "@/components/status";

const ACTIVE: AppointmentStatus[] = ["draft", "recording", "processing", "review", "completed"];

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageUser("doctor");
  const { status } = await searchParams;
  const filter = ACTIVE.includes(status as AppointmentStatus) ? (status as AppointmentStatus) : null;
  const { appointments } = await collections();
  const list = await appointments
    .find({ doctorId: user._id, status: filter ?? { $in: ACTIVE } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Приёмы</h1>
        <Link href="/appointments/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          + Новый приём
        </Link>
      </div>
      <div className="flex flex-wrap gap-1 text-sm">
        <FilterLink href="/appointments" active={!filter}>
          Все активные
        </FilterLink>
        {ACTIVE.map((s) => (
          <FilterLink key={s} href={`/appointments?status=${s}`} active={filter === s}>
            {APPOINTMENT_STATUS_LABEL[s]}
          </FilterLink>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Приёмов пока нет. Создайте новый приём.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Пациент</th>
                <th className="hidden px-4 py-2 sm:table-cell">Повод обращения</th>
                <th className="px-4 py-2">Создан</th>
                <th className="px-4 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a._id.toHexString()} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/appointments/${a._id.toHexString()}`} className="font-medium text-brand-700 hover:underline">
                      {a.patientName}
                    </Link>
                  </td>
                  <td className="hidden max-w-xs truncate px-4 py-3 text-slate-600 sm:table-cell">{a.reason ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{a.createdAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Almaty" })}</td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full px-3 py-1 ${active ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
      {children}
    </Link>
  );
}
