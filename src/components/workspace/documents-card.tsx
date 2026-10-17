"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Printer } from "lucide-react";
import { apiFetch, fmtDateTime } from "@/lib/client";
import type { AppointmentDTO, DocumentDTO, TemplateDTO } from "@/lib/dto";
import { approvalBlockers } from "@/lib/rules";
import type { DocumentFieldValue } from "@/lib/types";
import { DocumentStatusBadge, FieldStatusBadge } from "../status";
import { Alert, Button, Card, Select, cx } from "../ui";

export function DocumentsCard({
  appt,
  templates,
  onChange,
  defaultTemplateId = null,
  index,
}: {
  index?: string;
  appt: AppointmentDTO;
  templates: TemplateDTO[];
  onChange: () => Promise<void>;
  defaultTemplateId?: string | null;
}) {
  const editable = appt.status === "review";
  const [templateId, setTemplateId] = useState(
    (defaultTemplateId && templates.some((t) => t.id === defaultTemplateId) ? defaultTemplateId : templates[0]?.id) ?? "",
  );
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
    <div className="space-y-6">
      {editable && (
        <Card index={index} title="Медицинские документы">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <label className="min-w-64 flex-1">
              <span className="kicker mb-1 block text-ink-2">Шаблон</span>
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
              Сформировать черновик
            </Button>
            <Button variant="secondary" onClick={() => generate("blank")} loading={busy === "blank"} disabled={!templateId || existing?.status === "approved"}>
              Пустой бланк
            </Button>
          </div>
          {busy === "ai" && <p className="mt-3 text-sm text-ink-3">ИИ анализирует транскрипцию, обычно это занимает 5–30 секунд…</p>}
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-ink-3">
            ИИ заполняет только поля шаблона и только сведениями из транскрипции. Поля без сведений остаются пустыми, сомнительные помечаются
            «Требует проверки». Документ не подтверждается автоматически.
          </p>
        </Card>
      )}
      {appt.documents.length === 0 && !editable && (
        <Card index={index} title="Медицинские документы">
          <p className="text-sm text-ink-3">Документов нет.</p>
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
    <article className="border border-line-2 bg-sheet shadow-[4px_4px_0_0_rgba(20,20,20,0.06)]">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="kicker text-ink-3">Документ · шаблон v{doc.templateVersion}</span>
          <DocumentStatusBadge status={doc.status} />
        </div>
        <div className="flex items-center gap-4">
          <a href={`/print/documents/${doc.id}`} target="_blank" className="kicker inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">
            <Printer className="h-3.5 w-3.5" /> Печать
          </a>
          {editable && doc.status !== "approved" && (
            <button onClick={remove} disabled={busy === "delete"} className="kicker text-ink-3 hover:text-signal">
              Удалить
            </button>
          )}
        </div>
      </header>

      <div className="px-6 pt-6 pb-2 sm:px-10">
        <h3 className="font-serif text-[26px] leading-tight font-semibold tracking-[-0.01em]">{doc.templateName}</h3>
        <p className="mt-2 font-mono text-[12px] text-ink-3">
          {[
            doc.generatedAt && `сформирован ИИ ${fmtDateTime(doc.generatedAt)}`,
            doc.reviewedAt && `проверен ${fmtDateTime(doc.reviewedAt)}`,
            !locked && `требует проверки: ${counts.uncertain} · без сведений: ${counts.missing} · проверено: ${counts.confirmed}`,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>

        <div className="mt-6 border-t border-ink">
          {doc.fields.map((f, i) => {
            const v = preview[f.key];
            const d = draft[f.key];
            const uncertain = v.status === "uncertain" && !locked;
            return (
              <div key={f.key} className="grid gap-x-8 gap-y-2 border-b border-line py-4 md:grid-cols-[210px_minmax(0,1fr)]">
                <div className={cx("md:pt-1", uncertain && "border-l-2 border-[#c48a1d] pl-3")}>
                  <p className="text-[14px] leading-snug font-medium text-ink">
                    <span className="mr-2 font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    {f.label}
                    {f.required && <span className="text-signal"> *</span>}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <FieldStatusBadge status={v.status} />
                    {!locked && v.status !== "confirmed" && (
                      <button
                        type="button"
                        className="kicker inline-flex items-center gap-1 text-ink underline decoration-dotted underline-offset-4 hover:decoration-solid"
                        onClick={() => setDraft({ ...draft, [f.key]: { ...d, confirmed: true } })}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                        {v.status === "missing" ? "нет сведений — верно" : "проверено"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  {locked ? (
                    <p className="font-serif text-[17px] leading-[28px] whitespace-pre-wrap text-ink">{v.value || <span className="text-ink-3">—</span>}</p>
                  ) : f.multiline ? (
                    <textarea
                      value={d.value}
                      rows={Math.min(10, Math.max(2, d.value.split("\n").length + 1))}
                      onChange={(e) => setDraft({ ...draft, [f.key]: { ...d, value: e.target.value } })}
                      placeholder={v.status === "missing" ? "Сведений в расшифровке нет — заполните при необходимости" : undefined}
                      className="ruled w-full resize-y border-0 bg-transparent px-0 font-serif text-[17px] text-ink outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-ink-3/70 focus:bg-paper/40"
                    />
                  ) : (
                    <input
                      value={d.value}
                      onChange={(e) => setDraft({ ...draft, [f.key]: { ...d, value: e.target.value } })}
                      placeholder={v.status === "missing" ? "Сведений нет" : undefined}
                      className="h-[28px] w-full border-0 border-b border-line bg-transparent px-0 font-serif text-[17px] text-ink outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-ink-3/70 focus:border-ink"
                    />
                  )}
                  {v.evidence && !locked && (
                    <p className="mt-2 text-[13px] text-ink-3">
                      <span className="kicker mr-2 text-ink-3">Источник</span>«{v.evidence}»
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {doc.approvedAt ? (
          <div className="mt-8 mb-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="kicker text-ink-3">Подтверждено врачом</p>
              <p className="mt-1 font-serif text-[18px]">{doc.approvedByName}</p>
              <p className="font-mono text-[12px] text-ink-3">{fmtDateTime(doc.approvedAt)}</p>
            </div>
            <span className="border-2 border-ok px-3 py-1 font-mono text-[12px] tracking-[0.12em] text-ok uppercase">Подтверждён</span>
          </div>
        ) : null}
      </div>

      {editable && (
        <footer className="space-y-4 border-t border-line bg-paper/50 px-6 py-5 sm:px-10">
          {doc.status !== "approved" ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  variant={dirty || doc.status !== "review" ? "primary" : "secondary"}
                  onClick={save}
                  loading={busy === "save"}
                  disabled={!dirty && doc.status === "review"}
                >
                  {doc.status === "review" ? "Сохранить изменения" : "Сохранить и перейти к проверке"}
                </Button>
                {dirty && <span className="kicker text-warn">Есть несохранённые изменения</span>}
              </div>
              {doc.status === "review" && !dirty && (
                <div className="border-t border-line pt-4">
                  {blockers.length > 0 ? (
                    <Alert tone="yellow">{`Перед подтверждением проверьте поля:\n${blockers.join("\n")}`}</Alert>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="h-4 w-4 accent-[#141414]" />
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
        </footer>
      )}
    </article>
  );
}
