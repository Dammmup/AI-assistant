import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/labels";
import type { AppointmentStatus } from "@/lib/types";
import { AppointmentStatusBadge } from "@/components/status";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Приёмы" };

const ACTIVE: AppointmentStatus[] = ["draft", "recording", "processing", "review", "completed"];
const fmt = (d: Date) =>
  d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageUser("doctor");
  const { status } = await searchParams;
  const filter = ACTIVE.includes(status as AppointmentStatus) ? (status as AppointmentStatus) : null;
  const { appointments } = await collections();
  const [list, counts] = await Promise.all([
    appointments
      .find({ doctorId: user._id, status: filter ?? { $in: ACTIVE } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    appointments.aggregate<{ _id: AppointmentStatus; n: number }>([{ $match: { doctorId: user._id, status: { $in: ACTIVE } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
  ]);
  const countOf = (s: AppointmentStatus) => counts.find((c) => c._id === s)?.n ?? 0;
  const total = counts.reduce((a, c) => a + c.n, 0);

  return (
    <div>
      <PageHeader
        title="Приёмы"
        description="Текущие приёмы. Завершённые после архивации переходят в архив."
        actions={
          <Link href="/appointments/new" className="inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Новый приём
          </Link>
        }
      />
      <div className="-mt-2 mb-4 flex gap-5 overflow-x-auto border-b border-line text-[13px]">
        <Tab href="/appointments" active={!filter} label="Все" n={total} />
        {ACTIVE.map((s) => (
          <Tab key={s} href={`/appointments?status=${s}`} active={filter === s} label={APPOINTMENT_STATUS_LABEL[s]} n={countOf(s)} />
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-2 px-6 py-14 text-center">
          <p className="text-[15px] font-medium">{filter ? "Приёмов с таким статусом нет" : "Приёмов пока нет"}</p>
          <p className="mt-1 text-sm text-ink-3">Создайте приём, зафиксируйте согласие пациента и начните запись.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                <th className="px-4 py-2.5 font-medium">Пациент</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Повод обращения</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Создан</th>
                <th className="px-4 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((a) => (
                <tr key={a._id.toHexString()} className="group hover:bg-paper/70">
                  <td className="px-4 py-3">
                    <Link href={`/appointments/${a._id.toHexString()}`} className="font-medium text-ink group-hover:text-brand-600">
                      {a.patientName}
                    </Link>
                  </td>
                  <td className="hidden max-w-xs truncate px-4 py-3 text-ink-2 md:table-cell">{a.reason ?? <span className="text-ink-3">—</span>}</td>
                  <td className="hidden px-4 py-3 font-mono text-[13px] whitespace-nowrap text-ink-2 tabular sm:table-cell">{fmt(a.createdAt)}</td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tab({ href, active, label, n }: { href: string; active: boolean; label: string; n: number }) {
  return (
    <Link
      href={href}
      className={`-mb-px flex items-center gap-1.5 border-b-2 py-2.5 whitespace-nowrap ${active ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
    >
      {label}
      <span className="font-mono text-[12px] text-ink-3 tabular">{n}</span>
    </Link>
  );
}
