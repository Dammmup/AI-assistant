import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Архив" };
import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";

const INPUT = "h-10 border-0 border-b border-line-2 bg-transparent px-0 text-[15px] text-ink outline-none hover:border-ink-3 focus:border-ink focus:shadow-[inset_0_-1px_0_var(--color-ink)]";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ q?: string; from?: string; to?: string }> }) {
  const user = await requirePageUser("doctor");
  const { q = "", from = "", to = "" } = await searchParams;
  const { archive, appointments } = await collections();
  const dateFilter: Record<string, Date> = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) dateFilter.$gte = new Date(`${from}T00:00:00+05:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) dateFilter.$lte = new Date(`${to}T23:59:59+05:00`);
  const list = await archive
    .find({
      doctorId: user._id,
      ...(q.trim() ? { patientName: { $regex: escape(q.trim().slice(0, 100)), $options: "i" } } : {}),
      ...(Object.keys(dateFilter).length ? { archivedAt: dateFilter } : {}),
    })
    .sort({ archivedAt: -1 })
    .limit(200)
    .toArray();
  const appts = await appointments
    .find({ _id: { $in: list.map((a) => a.appointmentId) } }, { projection: { reason: 1, startedAt: 1, createdAt: 1 } })
    .toArray();
  const byId = new Map(appts.map((a) => [a._id.toHexString(), a]));
  const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Almaty" }) : "—");

  return (
    <div className="space-y-4">
      <PageHeader kicker="Журнал" title="Архив" description="Завершённые приёмы. Доступны только для просмотра." />
      <form className="mb-8 flex flex-wrap items-end gap-x-8 gap-y-4" data-paywall-allow>
        <label className="relative min-w-56 flex-1 text-[13px]">
          <span className="kicker mb-1 block text-ink-2">Пациент</span>
          <Search className="pointer-events-none absolute bottom-3 left-0 h-4 w-4 text-ink-3" />
          <input name="q" defaultValue={q} placeholder="Поиск по ФИО" className={`${INPUT} w-full pl-6`} />
        </label>
        <label className="text-[13px]">
          <span className="kicker mb-1 block text-ink-2">В архиве с</span>
          <input type="date" name="from" defaultValue={from} className={INPUT} />
        </label>
        <label className="text-[13px]">
          <span className="kicker mb-1 block text-ink-2">по</span>
          <input type="date" name="to" defaultValue={to} className={INPUT} />
        </label>
        <button className="h-10 border border-ink bg-ink px-5 text-sm font-medium text-sheet hover:bg-[#2c2b28]">Найти</button>
        {(q || from || to) && (
          <Link href="/archive" className="flex h-9 items-center px-2 text-sm text-ink-2 hover:text-ink">
            Сбросить
          </Link>
        )}
      </form>
      <div className="overflow-x-auto">
        {list.length === 0 ? (
          <p className="border-y border-line px-6 py-16 text-center text-sm text-ink-3">{q || from || to ? "Ничего не найдено — измените условия поиска" : "В архиве пока пусто"}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="kicker border-y border-ink text-left text-ink-3">
              <tr>
                <th className="py-2.5 pr-4 font-normal">Пациент</th>
                <th className="hidden py-2.5 pr-4 font-normal sm:table-cell">Повод обращения</th>
                <th className="py-2.5 pr-4 font-normal">Приём</th>
                <th className="py-2.5 pr-4 font-normal">В архиве с</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const appt = byId.get(a.appointmentId.toHexString());
                return (
                  <tr key={a._id.toHexString()} className="border-b border-line hover:bg-sheet">
                    <td className="py-3.5 pr-4">
                      <Link href={`/appointments/${a.appointmentId.toHexString()}`} className="font-medium text-ink underline-offset-4 hover:underline">
                        {a.patientName}
                      </Link>
                    </td>
                    <td className="hidden max-w-xs truncate py-3.5 pr-4 text-ink-2 sm:table-cell">{appt?.reason ?? "—"}</td>
                    <td className="py-3.5 pr-4 font-mono text-[13px] whitespace-nowrap text-ink-2 tabular">{fmt(appt?.startedAt ?? appt?.createdAt)}</td>
                    <td className="py-3.5 pr-4 font-mono text-[13px] whitespace-nowrap text-ink-2 tabular">{fmt(a.archivedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
