import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";

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
      <h1 className="text-2xl font-semibold">Архив приёмов</h1>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="min-w-56 flex-1 text-sm">
          <span className="mb-1 block font-medium text-slate-700">Пациент</span>
          <input name="q" defaultValue={q} placeholder="ФИО" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Архивирован с</span>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">по</span>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Найти</button>
        {(q || from || to) && (
          <Link href="/archive" className="px-2 py-2 text-sm text-slate-600 hover:underline">
            Сбросить
          </Link>
        )}
      </form>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Ничего не найдено</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Пациент</th>
                <th className="hidden px-4 py-2 sm:table-cell">Повод обращения</th>
                <th className="px-4 py-2">Приём</th>
                <th className="px-4 py-2">В архиве с</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const appt = byId.get(a.appointmentId.toHexString());
                return (
                  <tr key={a._id.toHexString()} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/appointments/${a.appointmentId.toHexString()}`} className="font-medium text-brand-700 hover:underline">
                        {a.patientName}
                      </Link>
                    </td>
                    <td className="hidden max-w-xs truncate px-4 py-3 text-slate-600 sm:table-cell">{appt?.reason ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmt(appt?.startedAt ?? appt?.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmt(a.archivedAt)}</td>
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
