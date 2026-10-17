"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, fmtDate } from "@/lib/client";
import type { PatientDTO } from "@/lib/dto";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { ageOn, formatAge, MAX_AGE, normalizeFullName, todayIso, validateBirthDate, validateFullName } from "@/lib/patient-validation";
import { Alert, Button, Card, Input, Label, Select, Textarea, cx } from "./ui";

const invalidCls = "border-[#b9443a]! hover:border-[#b9443a]! focus:shadow-[0_0_0_3px_rgba(185,68,58,0.14)]!";
const FieldError = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <p id={id} className="mt-1.5 text-[13px] text-[#8a2922]">
    {children}
  </p>
);

export function NewAppointmentForm({ defaultLanguage = "ru" }: { defaultLanguage?: "ru" | "kk" | "auto" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientDTO[]>([]);
  const [selected, setSelected] = useState<PatientDTO | null>(null);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [externalPatientId, setExternalPatientId] = useState("");
  const [reason, setReason] = useState("");
  const [language, setLanguage] = useState<"ru" | "kk" | "auto">(defaultLanguage);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ fn: false, dob: false });
  const [submitted, setSubmitted] = useState(false);

  const today = todayIso();
  const nameError = validateFullName(fullName);
  const dobError = validateBirthDate(dateOfBirth || null, today);
  const showNameError = (touched.fn || submitted) && !!nameError;
  const showDobError = (touched.dob || submitted) && !!dobError;
  const minDob = `${Number(today.slice(0, 4)) - MAX_AGE}${today.slice(4)}`;

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
    if (mode === "new") {
      setSubmitted(true);
      if (nameError || dobError) {
        document.getElementById(nameError ? "fn" : "dob")?.focus();
        return;
      }
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ id: string }>("/api/appointments", {
        method: "POST",
        json: {
          ...(mode === "existing"
            ? { patientId: selected!.id }
            : { newPatient: { fullName: normalizeFullName(fullName), dateOfBirth: dateOfBirth || null, externalPatientId: externalPatientId || null } }),
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
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card title="Пациент">
        <div className="mb-5 inline-flex rounded-[5px] border border-line-2 p-0.5 text-[13px]">
          {(["new", "existing"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-[4px] px-3 py-1.5 ${mode === m ? "bg-ink font-medium text-white" : "text-ink-2 hover:text-ink"}`}
            >
              {m === "new" ? "Новый пациент" : "Из моих пациентов"}
            </button>
          ))}
        </div>
        {mode === "new" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fn" hint="отчество — при наличии">
                ФИО пациента *
              </Label>
              <Input
                id="fn"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, fn: true }));
                  if (fullName.trim()) setFullName(normalizeFullName(fullName));
                }}
                placeholder="Фамилия Имя Отчество"
                autoComplete="off"
                aria-invalid={showNameError}
                aria-describedby={showNameError ? "fn-error" : undefined}
                className={cx(showNameError && invalidCls)}
              />
              {showNameError && <FieldError id="fn-error">{nameError}</FieldError>}
            </div>
            <div>
              <Label htmlFor="dob">Дата рождения</Label>
              <Input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, dob: true }))}
                min={minDob}
                max={today}
                aria-invalid={showDobError}
                aria-describedby={showDobError ? "dob-error" : undefined}
                className={cx(showDobError && invalidCls)}
              />
              {showDobError ? (
                <FieldError id="dob-error">{dobError}</FieldError>
              ) : (
                dateOfBirth &&
                !dobError && <p className="mt-1.5 text-[13px] text-ink-3">Возраст: {formatAge(ageOn(dateOfBirth, today))}</p>
              )}
            </div>
            <div>
              <Label htmlFor="ext">ID во внешней системе</Label>
              <Input id="ext" value={externalPatientId} onChange={(e) => setExternalPatientId(e.target.value)} placeholder="необязательно" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            <div className="max-h-64 divide-y divide-line overflow-auto rounded-[5px] border border-line">
              {results.length === 0 && <p className="p-3 text-sm text-ink-3">Пациенты не найдены</p>}
              {results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-paper ${selected?.id === p.id ? "bg-brand-50 shadow-[inset_2px_0_0_var(--color-brand-600)]" : ""}`}
                >
                  <span className="font-medium">{p.fullName}</span>
                  <span className="ml-2 text-ink-3">
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
