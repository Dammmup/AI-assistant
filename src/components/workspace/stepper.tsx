import { Check } from "lucide-react";
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

/** Ход приёма — вертикальная шкала этапов. */
export function Stepper({ appt }: { appt: AppointmentDTO }) {
  const steps = appointmentSteps(appt);
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && <span className={cx("absolute top-5 left-[9px] h-[calc(100%-12px)] w-px", s.done ? "bg-[#3b8a5c]/50" : "bg-line")} />}
          <span
            className={cx(
              "relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
              s.done
                ? "border-[#3b8a5c] bg-[#3b8a5c] text-white"
                : i === current
                  ? "border-brand-600 bg-white text-brand-600 shadow-[0_0_0_3px_rgba(43,76,116,0.12)]"
                  : "border-line-2 bg-white text-ink-3",
            )}
          >
            {s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
          </span>
          <span className={cx("text-[13px] leading-[1.45]", s.done ? "text-ink-2" : i === current ? "font-medium text-ink" : "text-ink-3")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
