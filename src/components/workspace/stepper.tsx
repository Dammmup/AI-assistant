import type { AppointmentDTO } from "@/lib/dto";
import { cx } from "../ui";

export function Stepper({ appt }: { appt: AppointmentDTO }) {
  const docs = appt.documents;
  const steps: { label: string; done: boolean }[] = [
    { label: "Запись приёма создана", done: true },
    { label: "Согласие пациента", done: !!appt.consent },
    { label: "Запись и транскрипция", done: !!appt.transcript && ["review", "completed", "archived"].includes(appt.status) },
    { label: "Структурирование ИИ", done: docs.some((d) => d.model) },
    { label: "Заполнение шаблонов", done: docs.length > 0 },
    { label: "Проверка врачом", done: docs.length > 0 && docs.every((d) => d.status === "review" || d.status === "approved") },
    { label: "Подтверждение", done: ["completed", "archived"].includes(appt.status) },
    { label: "Архив", done: appt.status === "archived" },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="no-print grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={cx(
            "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
            s.done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : i === current ? "border-brand-500 bg-white font-medium text-brand-900" : "border-slate-200 bg-white text-slate-500",
          )}
        >
          <span
            className={cx(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              s.done ? "bg-emerald-600 text-white" : i === current ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600",
            )}
          >
            {s.done ? "✓" : i + 1}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}
