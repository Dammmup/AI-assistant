import type { AppointmentDTO } from "@/lib/dto";
import { cx } from "@/lib/cx";

export function appointmentSteps(appt: AppointmentDTO) {
  const docs = appt.documents;
  return [
    { label: "Приём создан", done: true },
    { label: "Согласие пациента", done: !!appt.consent },
    { label: "Запись и расшифровка", done: !!appt.transcript && ["review", "completed", "archived"].includes(appt.status) },
    { label: "Черновик документа", done: docs.length > 0 },
    { label: "Проверка врачом", done: docs.length > 0 && docs.every((d) => d.status === "review" || d.status === "approved") },
    { label: "Подтверждение", done: ["completed", "archived"].includes(appt.status) },
    { label: "Архив", done: appt.status === "archived" },
  ];
}

/** Ход приёма — пронумерованный перечень этапов. */
export function Stepper({ appt }: { appt: AppointmentDTO }) {
  const steps = appointmentSteps(appt);
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s.label} className="grid grid-cols-[28px_1fr_16px] items-center border-b border-line py-1.5 last:border-b-0">
          <span className={cx("font-mono text-[11px]", i === current ? "text-signal" : "text-ink-3")}>{String(i + 1).padStart(2, "0")}</span>
          <span className={cx("text-[13px]", s.done ? "text-ink-2" : i === current ? "font-medium text-ink" : "text-ink-3")}>{s.label}</span>
          <span className={cx("h-2 w-2 justify-self-end", s.done ? "bg-ink" : i === current ? "bg-signal" : "border border-line-2")} />
        </li>
      ))}
    </ol>
  );
}
