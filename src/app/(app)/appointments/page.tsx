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
        kicker="Журнал"
        title="Приёмы"
        description="Текущие приёмы. Завершённые после архивации переходят в архив."
        actions={
          <Link href="/appointments/new" className="inline-flex h-10 items-center gap-2 border border-ink bg-ink px-5 text-sm font-medium text-sheet hover:bg-[#2c2b28]">
            <Plus className="h-4 w-4" strokeWidth={2.25} /> Новый приём
          </Link>
        }
      />
      <div className="-mt-4 mb-6 flex gap-6 overflow-x-auto">
        <Tab href="/appointments" active={!filter} label="Все" n={total} />
        {ACTIVE.map((s) => (
          <Tab key={s} href={`/appointments?status=${s}`} active={filter === s} label={APPOINTMENT_STATUS_LABEL[s]} n={countOf(s)} />
        ))}
      </div>
      {list.length === 0 ? (
        <div className="border-y border-line px-6 py-16 text-center">
          <p className="text-[15px] font-medium">{filter ? "Приёмов с таким статусом нет" : "Приёмов пока нет"}</p>
          <p className="mt-1 text-sm text-ink-3">Создайте приём, зафиксируйте согласие пациента и начните запись.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="kicker border-y border-ink text-left text-ink-3">
                <th className="w-12 py-2.5 pr-3 font-normal">№</th>
                <th className="py-2.5 pr-4 font-normal">Пациент</th>
                <th className="hidden py-2.5 pr-4 font-normal md:table-cell">Повод обращения</th>
                <th className="hidden py-2.5 pr-4 font-normal sm:table-cell">Создан</th>
                <th className="py-2.5 font-normal">Статус</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a, i) => (
                <tr key={a._id.toHexString()} className="group border-b border-line hover:bg-sheet">
                  <td className="py-3.5 pr-3 font-mono text-[12px] text-ink-3 tabular">{String(i + 1).padStart(2, "0")}</td>
                  <td className="py-3.5 pr-4">
                    <Link href={`/appointments/${a._id.toHexString()}`} className="font-medium text-ink underline-offset-4 group-hover:underline">
                      {a.patientName}
                    </Link>
                  </td>
                  <td className="hidden max-w-xs truncate py-3.5 pr-4 text-ink-2 md:table-cell">{a.reason ?? <span className="text-ink-3">—</span>}</td>
                  <td className="hidden py-3.5 pr-4 font-mono text-[13px] whitespace-nowrap text-ink-2 tabular sm:table-cell">{fmt(a.createdAt)}</td>
                  <td className="py-3.5">
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
      className={`kicker flex items-center gap-2 border-b-2 py-2 whitespace-nowrap ${active ? "border-signal text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
    >
      {label}
      <span className={active ? "text-signal" : "text-ink-3"}>{n}</span>
    </Link>
  );
}
