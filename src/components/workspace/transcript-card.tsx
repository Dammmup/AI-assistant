"use client";

import { useEffect, useState } from "react";
import { apiFetch, fmtBytes, fmtDateTime, fmtDuration } from "@/lib/client";
import type { AppointmentDTO, SegmentDTO } from "@/lib/dto";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { Alert, Badge, Button, Card, Textarea } from "../ui";

export function TranscriptCard({ appt, onChange }: { appt: AppointmentDTO; onChange: () => Promise<void> }) {
  const t = appt.transcript;
  const editable = appt.status === "review";
  const live = appt.status === "recording" || appt.status === "processing";
  const [text, setText] = useState(t?.text ?? "");
  // Версия текста с сервера, от которой начаты локальные правки.
  const [serverText, setServerText] = useState(t?.text ?? "");
  const [baseline, setBaseline] = useState(t?.updatedAt ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = text !== serverText;

  // Подтягиваем серверный текст, если локальных правок нет.
  useEffect(() => {
    if (!t || t.updatedAt === baseline) return;
    if (!dirty) {
      setText(t.text);
      setServerText(t.text);
      setBaseline(t.updatedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.updatedAt, t?.text]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ updatedAt: string }>(`/api/appointments/${appt.id}/transcript`, {
        method: "PUT",
        json: { text, expectedUpdatedAt: baseline },
      });
      setServerText(text);
      setBaseline(res.updatedAt);
      await onChange();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!t && appt.segments.length === 0) return null;
  const failedCount = appt.segments.filter((s) => s.status === "failed" || s.stale).length;

  return (
    <Card
      title="Транскрипция"
      actions={
        t && (
          <>
            <Badge tone="gray">{LANGUAGE_LABEL[t.language]}</Badge>
            <Badge tone="gray">{t.provider === "manual" ? "ручной ввод" : t.provider}</Badge>
            {t.isEdited && <Badge tone="green" title={`Изменено ${fmtDateTime(t.editedAt)}`}>Отредактировано врачом</Badge>}
            {t.status === "partial" && <Badge tone="yellow">Есть нераспознанные фрагменты</Badge>}
          </>
        )
      }
    >
      <div className="space-y-4">
        {live ? (
          <LiveSegments segments={appt.segments} />
        ) : editable ? (
          <>
            <Textarea
              rows={Math.min(24, Math.max(8, text.split("\n").length + 2))}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t?.provider === "manual" ? "Введите или вставьте текст приёма…" : "Транскрипция пуста"}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={!dirty} loading={saving}>
                Сохранить транскрипцию
              </Button>
              {dirty && <span className="text-sm text-amber-700">Есть несохранённые изменения</span>}
              {saved && <span className="text-sm text-emerald-700">Сохранено</span>}
            </div>
            {error && <Alert>{error}</Alert>}
          </>
        ) : (
          <div className="max-h-[32rem] overflow-auto rounded-lg bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap">{t?.text || "—"}</div>
        )}

        {appt.segments.length > 0 && !live && (
          <details className="rounded-lg border border-slate-200" open={failedCount > 0 && editable}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
              Аудиофрагменты ({appt.segments.length}, {fmtBytes(appt.segments.reduce((sum, s) => sum + s.size, 0))}){failedCount > 0 && <span className="ml-2 text-amber-700">· требуют внимания: {failedCount}</span>}
            </summary>
            <div className="divide-y divide-slate-100 border-t border-slate-200">
              {appt.segments.map((s) => (
                <SegmentRow key={s.id} s={s} canRetry={editable || appt.status === "processing"} onChange={onChange} />
              ))}
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

function LiveSegments({ segments }: { segments: SegmentDTO[] }) {
  if (segments.length === 0) return <p className="text-sm text-slate-500">Ожидание первого фрагмента…</p>;
  return (
    <div className="max-h-[28rem] space-y-2 overflow-auto rounded-lg bg-slate-50 p-4 text-sm leading-relaxed">
      {segments.map((s) => (
        <p key={s.id} className={s.status === "failed" ? "text-amber-700" : s.status === "pending" ? "text-slate-400" : ""}>
          <span className="mr-2 text-xs text-slate-400 tabular-nums">
            №{s.seq + 1} · {fmtDuration(s.durationSeconds)} · {fmtBytes(s.size)}
          </span>
          {s.status === "done" ? s.text || <span className="text-slate-400">[тишина]</span> : s.status === "pending" ? "распознаётся…" : `[фрагмент ${s.seq + 1} не распознан: ${s.error}]`}
        </p>
      ))}
    </div>
  );
}

function SegmentRow({ s, canRetry, onChange }: { s: SegmentDTO; canRetry: boolean; onChange: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [play, setPlay] = useState(false);
  const retryable = s.status === "failed" || s.stale || (s.status === "done" && !s.text);

  async function retry() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/segments/${s.id}/retry`, { method: "POST" });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-700">№{s.seq + 1}</span>
        <span className="text-slate-500">{fmtDuration(s.durationSeconds)}</span>
        <span className="text-slate-500" title={`${s.size.toLocaleString("ru-RU")} байт`}>
          {fmtBytes(s.size)}
        </span>
        {s.source === "upload" && <Badge>файл</Badge>}
        {s.status === "done" && (s.text ? <Badge tone="green">распознан</Badge> : <Badge>тишина / пусто</Badge>)}
        {s.status === "failed" && <Badge tone="red" title={s.error ?? ""}>ошибка</Badge>}
        {s.status === "pending" && (s.stale ? <Badge tone="yellow">прервано</Badge> : <Badge tone="blue">обработка</Badge>)}
        <span className="ml-auto flex gap-2">
          {!play && (
            <Button size="sm" variant="ghost" onClick={() => setPlay(true)}>
              ▶ Прослушать
            </Button>
          )}
          {canRetry && retryable && (
            <Button size="sm" variant="secondary" loading={loading} onClick={retry}>
              Распознать повторно
            </Button>
          )}
        </span>
      </div>
      {play && <audio controls autoPlay preload="none" src={`/api/segments/${s.id}/audio`} className="h-8 w-full" />}
      {s.error && s.status === "failed" && <p className="text-xs text-red-700">{s.error}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
