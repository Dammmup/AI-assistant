import type { AppointmentStatus, DocumentStatus, FieldStatus, SpeechLanguage } from "./types";

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  draft: "Черновик",
  recording: "Идёт запись",
  processing: "Обработка",
  review: "Проверка врачом",
  completed: "Завершён",
  archived: "В архиве",
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "Черновик",
  generated: "Сформирован ИИ",
  review: "На проверке",
  approved: "Подтверждён",
};

export const FIELD_STATUS_LABEL: Record<FieldStatus, string> = {
  filled: "Заполнено ИИ",
  uncertain: "Требует проверки",
  missing: "Нет сведений",
  confirmed: "Проверено врачом",
};

export const LANGUAGE_LABEL: Record<SpeechLanguage, string> = {
  ru: "Русский",
  kk: "Казахский",
  auto: "Автоопределение",
};

export const ROLE_LABEL = { doctor: "Врач", admin: "Администратор" } as const;
