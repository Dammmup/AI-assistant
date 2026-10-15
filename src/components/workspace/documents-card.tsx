"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, fmtDateTime } from "@/lib/client";
import type { AppointmentDTO, DocumentDTO, TemplateDTO } from "@/lib/dto";
import { approvalBlockers } from "@/lib/rules";
import type { DocumentFieldValue } from "@/lib/types";
import { DocumentStatusBadge, FieldStatusBadge } from "../status";
import { Alert, Button, Card, Input, Select, Textarea } from "../ui";

export function DocumentsCard({ appt, templates, onChange }: { appt: AppointmentDTO; templates: TemplateDTO[]; onChange: () => Promise<void> }) {
  const editable = appt.status === "review";
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [busy, setBusy] = useState<null | "ai" | "blank">(null);
  const [error, setError] = useState<string | null>(null);
  const consentOk = appt.consent?.status === "obtained";
  const hasText = !!appt.transcript?.text.trim();
  const existing = appt.documents.find((d) => d.templateId === templateId);

  async function generate(mode: "ai" | "blank") {
    if (existing && !confirm("Документ по этому шаблону уже есть. Сформировать заново? Текущие правки будут заменены.")) return;
    setBusy(mode);
    setError(null);
    try {
      await apiFetch(`/api/appointments/${appt.id}/documents`, { method: "POST", json: { templateId, mode } });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!["review", "completed", "archived"].includes(appt.status)) return null;

  return (
    <div className="space-y-4">
      {editable && (
        <Card title="Медицинские документы">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Шаблон</span>
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              onClick={() => generate("ai")}
              loading={busy === "ai"}
              disabled={!templateId || !consentOk || !hasText || existing?.status === "approved" || appt.transcript?.status === "in_progress"}
              title={!consentOk ? "Нет согласия пациента на обработку ИИ" : !hasText ? "Транскрипция пуста" : undefined}
            >
              ✦ Сформировать черновик (ИИ)
            </Button>
            <Button variant="secondary" onClick={() => generate("blank")} loading={busy === "blank"} disabled={!templateId || existing?.status === "approved"}>
              Пустой бланк
            </Button>
          </div>
          {busy === "ai" && <p className="mt-3 text-sm text-slate-500">ИИ анализирует транскрипцию, обычно это занимает 5–30 секунд…</p>}
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            ИИ заполняет только поля шаблона и только сведениями из транскрипции. Поля без сведений остаются пустыми, сомнительные помечаются
            «Требует проверки». Документ не подтверждается автоматически.
          </p>
        </Card>
      )}
      {appt.documents.length === 0 && !editable && (
        <Card title="Медицинские документы">
          <p className="text-sm text-slate-500">Документов нет.</p>
        </Card>
      )}
      {appt.documents.map((d) => (
        <DocumentEditor key={d.id} doc={d} editable={editable} onChange={onChange} />
      ))}
    </div>
  );
}

type Draft = Record<string, { value: string; confirmed: boolean }>;

function toDraft(doc: DocumentDTO): Draft {
  return Object.fromEntries(doc.fields.map((f) => [f.key, { value: doc.content[f.key]?.value ?? "", confirmed: false }]));
}

function DocumentEditor({ doc, editable, onChange }: { doc: DocumentDTO; editable: boolean; onChange: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(doc));
  const [busy, setBusy] = useState<null | "save" | "approve" | "reopen" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const locked = !editable || doc.status === "approved";

  useEffect(() => {
    setDraft(toDraft(doc));
    setReviewed(false);
  }, [doc.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = doc.fields.some((f) => draft[f.key].value !== (doc.content[f.key]?.value ?? "") || draft[f.key].confirmed);

  // Предварительный статус полей с учётом несохранённых правок — для подсказок до сохранения.
  const preview = useMemo(() => {
    const content: Record<string, DocumentFieldValue> = {};
    for (const f of doc.fields) {
      const cur = doc.content[f.key] ?? { value: "", status: "missing", evidence: null };
      const d = draft[f.key];
      const changed = d.value.trim() !== cur.value;
      content[f.key] = { ...cur, value: d.value, status: changed || d.confirmed ? "confirmed" : cur.status };
    }
    return content;
  }, [doc, draft]);
  const blockers = approvalBlockers({ fields: doc.fields, content: preview });
  const counts = useMemo(() => {
    const c = { filled: 0, uncertain: 0, missing: 0, confirmed: 0 };
    for (const f of doc.fields) c[preview[f.key].status]++;
    return c;
  }, [doc.fields, preview]);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", () =>
      apiFetch(`/api/documents/${doc.id}`, { method: "PATCH", json: { action: "save", expectedUpdatedAt: doc.updatedAt, content: draft } }),
    );
  const approve = () => run("approve", () => apiFetch(`/api/documents/${doc.id}`, { method: "PATCH", json: { action: "approve", confirm: true } }));
  const reopen = () => run("reopen", () => apiFetch(`/api/documents/${doc.id}`, { method: "PATCH", json: { action: "reopen" } }));
  const remove = () => {
    if (!confirm("Удалить документ?")) return;
    void run("delete", () => apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" }));
  };

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {doc.templateName}
          <DocumentStatusBadge status={doc.status} />
        </span>
      }
      actions={
        <>
          <a href={`/print/documents/${doc.id}`} target="_blank" className="rounded-lg px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
            🖨 Печать
          </a>
          {editable && doc.status !== "approved" && (
            <Button size="sm" variant="ghost" onClick={remove} loading={busy === "delete"}>
              Удалить
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Шаблон v{doc.templateVersion}</span>
        {doc.generatedAt && <span>Сформирован ИИ: {fmtDateTime(doc.generatedAt)}</span>}
        {doc.reviewedAt && (
          <span>
            Проверен: {doc.reviewedByName}, {fmtDateTime(doc.reviewedAt)}
          </span>
        )}
        {doc.approvedAt && (
          <span className="font-medium text-emerald-700">
            Подтверждён: {doc.approvedByName}, {fmtDateTime(doc.approvedAt)}
          </span>
        )}
        {!locked && (
          <span>
            Требует проверки: {counts.uncertain} · без сведений: {counts.missing} · проверено: {counts.confirmed}
          </span>
        )}
      </div>

      <div className="space-y-5">
        {doc.fields.map((f) => {
          const v = preview[f.key];
          const d = draft[f.key];
          const Field = f.multiline ? Textarea : Input;
          return (
            <div key={f.key} className={v.status === "uncertain" && !locked ? "rounded-lg bg-amber-50/60 p-3 ring-1 ring-amber-200" : ""}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {f.label}
                  {f.required && <span className="text-red-600"> *</span>}
                </span>
                <FieldStatusBadge status={v.status} />
                {!locked && v.status !== "confirmed" && (
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-700 hover:underline"
                    onClick={() => setDraft({ ...draft, [f.key]: { ...d, confirmed: true } })}
                  >
                    {v.status === "missing" ? "✓ Подтвердить отсутствие сведений" : "✓ Проверено"}
                  </button>
                )}
              </div>
              {locked ? (
                <p className="text-sm whitespace-pre-wrap text-slate-800">{v.value || <span className="text-slate-400">—</span>}</p>
              ) : (
                <Field
                  value={d.value}
                  rows={f.multiline ? Math.min(10, Math.max(2, d.value.split("\n").length + 1)) : undefined}
                  onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
                    setDraft({ ...draft, [f.key]: { ...d, value: e.target.value } })
                  }
                  placeholder={v.status === "missing" ? "Сведений в транскрипции нет — заполните при необходимости" : undefined}
                />
              )}
              {v.evidence && !locked && (
                <p className="mt-1 text-xs text-slate-500">
                  Источник в транскрипции: <q className="italic">{v.evidence}</q>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {editable && (
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
          {doc.status !== "approved" ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant={dirty || doc.status !== "review" ? "primary" : "secondary"} onClick={save} loading={busy === "save"} disabled={!dirty && doc.status === "review"}>
                  {doc.status === "review" ? "Сохранить изменения" : "Сохранить и перейти к проверке"}
                </Button>
                {dirty && <span className="text-sm text-amber-700">Есть несохранённые изменения</span>}
              </div>
              {doc.status === "review" && !dirty && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {blockers.length > 0 ? (
                    <Alert tone="yellow">{`Перед подтверждением проверьте поля:\n${blockers.join("\n")}`}</Alert>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                        Я проверил(а) документ и подтверждаю его содержание
                      </label>
                      <Button onClick={approve} disabled={!reviewed} loading={busy === "approve"}>
                        Подтвердить документ
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <Button variant="secondary" onClick={reopen} loading={busy === "reopen"}>
              Вернуть на проверку
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
