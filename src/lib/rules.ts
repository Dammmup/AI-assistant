import type { DocumentFieldValue, TemplateField } from "./types";

/** Причины, по которым документ нельзя подтвердить (используется и на сервере, и в интерфейсе). */
export function approvalBlockers(doc: { fields: TemplateField[]; content: Record<string, DocumentFieldValue> }) {
  const blockers: string[] = [];
  for (const f of doc.fields) {
    const v = doc.content[f.key];
    if (!v) continue;
    if (v.status === "uncertain") blockers.push(`«${f.label}» — требует проверки`);
    else if (f.required && v.status === "missing") blockers.push(`«${f.label}» — обязательное поле не заполнено и не подтверждено`);
  }
  return blockers;
}
