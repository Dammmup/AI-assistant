"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, fmtBytes, fmtDateTime, fmtDuration } from "@/lib/client";
import type { AppointmentDTO, SegmentDTO } from "@/lib/dto";
import { LANGUAGE_LABEL } from "@/lib/labels";
import type { Speaker } from "@/lib/types";
import { Alert, Badge, Button, Card, Textarea, cx } from "../ui";

/* ---------- Реплики «Врач: … / Пациент: …» ---------- */

type Who = Exclude<Speaker, "unknown"> | null;
type Line = { who: Who; text: string };

const LABEL: Record<Exclude<Who, null>, string> = { doctor: "Врач", patient: "Пациент" };
const LINE_RE = /^(Врач|Пациент)\s*:\s?(.*)$/;

export function parseDialog(text: string): Line[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.match(LINE_RE);
      return m ? { who: m[1] === "Врач" ? "doctor" : "patient", text: m[2] } : { who: null, text: l };
    });
}

const serializeDialog = (lines: Line[]) => lines.map((l) => (l.who ? `${LABEL[l.who]}: ${l.text}` : l.text)).join("\n");

function SpeakerChip({ who, onClick, title }: { who: Who; onClick?: () => void; title?: string }) {
  const cls = who === "doctor" ? "bg-brand-600 text-white" : who === "patient" ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-600";
  const content = who ? LABEL[who] : "—";
  const base = cx("inline-flex h-6 w-[4.75rem] shrink-0 items-center justify-center rounded-md text-xs font-semibold", cls);
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={cx(base, "cursor-pointer ring-offset-1 hover:ring-2 hover:ring-slate-300")}>
      {content}
    </button>
  ) : (
    <span className={base} title={title}>
      {content}
    </span>
  );
}

function DialogView({ lines, onToggle }: { lines: Line[]; onToggle?: (i: number) => void }) {
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="flex items-start gap-3">
          <SpeakerChip
            who={l.who}
            onClick={onToggle ? () => onToggle(i) : undefined}
            title={onToggle ? "Нажмите, чтобы сменить говорящего: Врач → Пациент → без метки" : undefined}
          />
          <p className={cx("min-w-0 flex-1 text-sm leading-relaxed", l.who === "patient" && "text-sky-950")}>{l.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Карточка ---------- */

export function TranscriptCard({ appt, onChange, pendingUploads = 0 }: { appt: AppointmentDTO; onChange: () => Promise<void>; pendingUploads?: number }) {
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
  const [mode, setMode] = useState<"dialog" | "text">("dialog");
  const dirty = text !== serverText;
  const lines = parseDialog(text);
  const hasLabels = lines.some((l) => l.who);

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

  const toggleSpeaker = (i: number) => {
    const next = lines.map((l, j) => (j === i ? { ...l, who: (l.who === "doctor" ? "patient" : l.who === "patient" ? null : "doctor") as Who } : l));
    setText(serializeDialog(next));
  };
  const swapAll = () =>
    setText(serializeDialog(lines.map((l) => ({ ...l, who: l.who === "doctor" ? "patient" : l.who === "patient" ? "doctor" : null }))));

  if (!t && appt.segments.length === 0) return null;
  const failedCount = appt.segments.filter((s) => s.status === "failed" || s.stale).length;
  const showDialog = mode === "dialog" && (hasLabels || !text.trim()) && text.trim() !== "";

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
          <LiveDialog segments={appt.segments} pendingUploads={pendingUploads} />
        ) : editable ? (
          <>
            {hasLabels && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
                  {(["dialog", "text"] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-md px-3 py-1 ${mode === m ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
                    >
                      {m === "dialog" ? "Диалог" : "Редактировать текст"}
                    </button>
                  ))}
                </div>
                {mode === "dialog" && (
                  <Button size="sm" variant="secondary" onClick={swapAll} title="Если разметка перепутала роли целиком">
                    ⇄ Поменять Врач / Пациент
                  </Button>
                )}
              </div>
            )}
            {showDialog ? (
              <div className="max-h-[36rem] overflow-auto rounded-lg border border-slate-200 p-4">
                <DialogView lines={lines} onToggle={toggleSpeaker} />
                <p className="mt-3 text-xs text-slate-500">
                  Роли определены автоматически по смыслу реплик и могут ошибаться. Нажмите на метку, чтобы исправить; текст правится во вкладке
                  «Редактировать текст».
                </p>
              </div>
            ) : (
              <Textarea
                rows={Math.min(24, Math.max(8, text.split("\n").length + 2))}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t?.provider === "manual" ? "Введите или вставьте текст приёма. Реплики можно начинать с «Врач:» и «Пациент:»" : "Транскрипция пуста"}
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={!dirty} loading={saving}>
                Сохранить транскрипцию
              </Button>
              {dirty && <span className="text-sm text-amber-700">Есть несохранённые изменения</span>}
              {saved && <span className="text-sm text-emerald-700">Сохранено</span>}
            </div>
            {error && <Alert>{error}</Alert>}
          </>
        ) : hasLabels ? (
          <div className="max-h-[32rem] overflow-auto rounded-lg bg-slate-50 p-4">
            <DialogView lines={lines} />
          </div>
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

/** Живой диалог во время записи: реплики появляются по мере распознавания, метки — по мере разметки. */
function LiveDialog({ segments, pendingUploads }: { segments: SegmentDTO[]; pendingUploads: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const items: ({ kind: "line"; who: Who; text: string; labeled: boolean } | { kind: "note"; text: string; tone: "gray" | "amber" })[] = [];
  for (const s of segments) {
    if (s.status === "pending") items.push({ kind: "note", text: `фрагмент №${s.seq + 1} распознаётся…`, tone: "gray" });
    else if (s.status === "failed") items.push({ kind: "note", text: `фрагмент №${s.seq + 1} не распознан: ${s.error ?? ""} (аудио сохранено)`, tone: "amber" });
    else if (s.units.length && s.speakers?.length === s.units.length) {
      s.units.forEach((u, i) => {
        const sp = s.speakers![i];
        const who: Who = sp === "unknown" ? null : sp;
        const last = items.at(-1);
        if (last?.kind === "line" && last.labeled && last.who === who && who) last.text += ` ${u}`;
        else items.push({ kind: "line", who, text: u, labeled: true });
      });
    } else if (s.text) items.push({ kind: "line", who: null, text: s.text, labeled: false });
  }
  const count = items.length;
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, pendingUploads]);

  if (segments.length === 0 && pendingUploads === 0) return <p className="text-sm text-slate-500">Говорите — текст появится после первой фразы…</p>;
  return (
    <div ref={boxRef} className="max-h-[28rem] space-y-2 overflow-auto rounded-lg bg-slate-50 p-4">
      {items.map((it, i) =>
        it.kind === "note" ? (
          <p key={i} className={cx("text-xs", it.tone === "amber" ? "text-amber-700" : "text-slate-400")}>
            {it.text}
          </p>
        ) : (
          <div key={i} className="flex items-start gap-3">
            {it.labeled ? <SpeakerChip who={it.who} /> : <span className="inline-flex h-6 w-[4.75rem] shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] text-slate-400">определяется</span>}
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{it.text}</p>
          </div>
        ),
      )}
      {pendingUploads > 0 && (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" /> распознаётся…
        </p>
      )}
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
