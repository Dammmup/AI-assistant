"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, fmtDate } from "@/lib/client";
import type { PatientDTO } from "@/lib/dto";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { Alert, Button, Card, Input, Label, Select, Textarea } from "./ui";

export function NewAppointmentForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientDTO[]>([]);
  const [selected, setSelected] = useState<PatientDTO | null>(null);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [externalPatientId, setExternalPatientId] = useState("");
  const [reason, setReason] = useState("");
  const [language, setLanguage] = useState<"ru" | "kk" | "auto">("ru");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "existing") return;
    const t = setTimeout(() => {
      apiFetch<PatientDTO[]>(`/api/patients?q=${encodeURIComponent(query)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "existing" && !selected) return setError("Выберите пациента из списка");
    setLoading(true);
    try {
      const res = await apiFetch<{ id: string }>("/api/appointments", {
        method: "POST",
        json: {
          ...(mode === "existing"
            ? { patientId: selected!.id }
            : { newPatient: { fullName, dateOfBirth: dateOfBirth || null, externalPatientId: externalPatientId || null } }),
          reason: reason || null,
          language,
        },
      });
      router.push(`/appointments/${res.id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card title="Пациент">
        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["new", "existing"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
            >
              {m === "new" ? "Новый пациент" : "Из моих пациентов"}
            </button>
          ))}
        </div>
        {mode === "new" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fn">ФИО пациента *</Label>
              <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={3} placeholder="Фамилия Имя Отчество" />
            </div>
            <div>
              <Label htmlFor="dob">Дата рождения</Label>
              <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <Label htmlFor="ext">ID во внешней системе</Label>
              <Input id="ext" value={externalPatientId} onChange={(e) => setExternalPatientId(e.target.value)} placeholder="необязательно" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            <div className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
              {results.length === 0 && <p className="p-3 text-sm text-slate-500">Пациенты не найдены</p>}
              {results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${selected?.id === p.id ? "bg-brand-50" : ""}`}
                >
                  <span className="font-medium">{p.fullName}</span>
                  <span className="ml-2 text-slate-500">
                    {p.dateOfBirth ? `д.р. ${fmtDate(p.dateOfBirth)}` : ""} {p.externalPatientId ? `· ID ${p.externalPatientId}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
      <Card title="Параметры приёма">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="reason">Повод обращения</Label>
            <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="необязательно" />
          </div>
          <div>
            <Label htmlFor="lang">Язык речи на приёме</Label>
            <Select id="lang" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
              {(Object.keys(LANGUAGE_LABEL) as (keyof typeof LANGUAGE_LABEL)[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABEL[l]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          Создать приём
        </Button>
      </div>
    </form>
  );
}
