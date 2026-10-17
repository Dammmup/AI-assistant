"use client";

import { useState } from "react";
import { apiFetch, fmtDateTime } from "@/lib/client";
import { CONSENT_METHODS, CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";
import type { AppointmentDTO } from "@/lib/dto";
import { Alert, Badge, Button, Card, Input, Label } from "../ui";

export function ConsentCard({ appt, onChange, index }: { appt: AppointmentDTO; onChange: () => Promise<void>; index?: string }) {
  const [method, setMethod] = useState<"verbal" | "written">("verbal");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | "obtained" | "declined">(null);
  const c = appt.consent;
  const editable = appt.status === "draft";

  async function submit(status: "obtained" | "declined") {
    setError(null);
    setLoading(status);
    try {
      await apiFetch(`/api/appointments/${appt.id}/consent`, {
        method: "POST",
        json: { status, method, note: note || null, consentTextVersion: CONSENT_VERSION, ...(status === "obtained" ? { confirmed: true } : {}) },
      });
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  if (c && (!editable || c.status === "obtained")) {
    return (
      <Card index={index} title="Согласие пациента">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {c.status === "obtained" ? <Badge tone="green">Согласие получено</Badge> : <Badge tone="red">Пациент отказался</Badge>}
          <span className="text-ink-2">
            {CONSENT_METHODS[c.method]} · {fmtDateTime(c.obtainedAt)} · {c.obtainedByName} · версия текста {c.consentTextVersion}
          </span>
        </div>
        {c.note && <p className="mt-2 text-sm text-ink-2">Примечание: {c.note}</p>}
      </Card>
    );
  }

  return (
    <Card index={index} title="Согласие пациента на обработку данных">
      {c?.status === "declined" && (
        <div className="mb-3">
          <Alert tone="yellow">
            Пациент отказался ({fmtDateTime(c.obtainedAt)}). Аудиозапись и обработка ИИ недоступны — можно ввести сведения вручную. Если
            пациент передумал, зафиксируйте согласие повторно.
          </Alert>
        </div>
      )}
      <div className="border-l-2 border-ink bg-sheet px-5 py-4 font-serif text-[16px] leading-[1.6] whitespace-pre-line text-ink">{CONSENT_TEXT}</div>
      <p className="mt-1 text-xs text-ink-3">Версия текста согласия: {CONSENT_VERSION}</p>
      <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div>
          <Label>Форма согласия</Label>
          <div className="space-y-1.5 pt-1 text-[14px]">
            {(Object.keys(CONSENT_METHODS) as ("verbal" | "written")[]).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} className="accent-[#141414]" />
                {CONSENT_METHODS[m]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="note">Примечание</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="например, согласие дал законный представитель" />
        </div>
      </div>
      <label className="mt-6 flex cursor-pointer items-start gap-2.5 text-[14px]">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#141414]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Пациент ознакомлен с текстом и дал согласие
      </label>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!confirmed} loading={loading === "obtained"} onClick={() => submit("obtained")}>
          Зафиксировать согласие
        </Button>
        {c?.status !== "declined" && (
          <Button variant="secondary" loading={loading === "declined"} onClick={() => submit("declined")}>
            Пациент отказался
          </Button>
        )}
      </div>
    </Card>
  );
}
