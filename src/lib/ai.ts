import type { DocumentFieldValue, SpeechLanguage, TemplateField } from "./types";

const BASE_URL = (process.env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
export const STT_MODEL = process.env.STT_MODEL || "whisper-large-v3";
export const LLM_MODEL = process.env.LLM_MODEL || "openai/gpt-oss-120b";
export const PROVIDER = BASE_URL.includes("groq.com") ? "groq" : new URL(BASE_URL).host;

function apiKey() {
  const key = process.env.GROQ_API_KEY || process.env.AI_API_KEY;
  if (!key) throw new AiError("Не задан ключ API распознавания/ИИ (GROQ_API_KEY)");
  return key;
}

export class AiError extends Error {}

async function call(path: string, init: RequestInit, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey()}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError(`Сервис ИИ недоступен: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = body.slice(0, 300);
    try {
      message = JSON.parse(body)?.error?.message ?? message;
    } catch {}
    throw new AiError(`Ошибка API (${res.status}): ${message}`);
  }
  return res.json();
}

const MEDICAL_PROMPT = {
  ru: "Приём врача. Жалобы, анамнез, диагноз, назначения, дозировка, мг, таблетки.",
  kk: "Дәрігер қабылдауы. Шағымдар, анамнез, диагноз, тағайындаулар.",
};

export type TranscriptionResult = { text: string; units: string[] };

/** Делит текст на предложения — единицы, которым затем назначается говорящий. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function transcribeAudio(opts: {
  data: Buffer;
  mimeType: string;
  filename: string;
  language: SpeechLanguage;
  previousText?: string;
}): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(opts.data)], { type: opts.mimeType }), opts.filename);
  form.append("model", STT_MODEL);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (opts.language !== "auto") form.append("language", opts.language);
  // Подсказка: медицинская лексика + конец предыдущего фрагмента для связности.
  const hint = `${MEDICAL_PROMPT[opts.language === "kk" ? "kk" : "ru"]} ${(opts.previousText ?? "").slice(-400)}`.trim();
  form.append("prompt", hint);
  const json = (await call("/audio/transcriptions", { method: "POST", body: form }, 55_000)) as {
    text?: string;
    segments?: { text: string; no_speech_prob?: number; avg_logprob?: number }[];
  };
  // Отбрасываем куски, которые модель сама считает «не речью» (типичный источник выдуманного текста).
  const pieces = json.segments?.length
    ? json.segments.filter((sg) => !((sg.no_speech_prob ?? 0) > 0.6 && (sg.avg_logprob ?? 0) < -1)).map((sg) => sg.text)
    : [json.text ?? ""];
  const units = pieces.flatMap((t) => splitSentences(removeHallucinations(t)));
  return { text: units.join(" "), units };
}

import type { Speaker } from "./types";

const DIARIZE_PROMPT = `Ты размечаешь транскрипцию медицинского приёма по говорящим. Участники: врач и пациент (или его представитель).
Для каждой пронумерованной реплики определи, кто её произнёс: "D" — врач, "P" — пациент, "U" — нельзя определить.
Подсказки: врач задаёт вопросы о жалобах и анамнезе, озвучивает осмотр, диагноз, назначения и рекомендации; пациент описывает своё самочувствие, отвечает на вопросы.
Короткие ответы («да», «нет», «понятно») обычно принадлежат собеседнику того, кто задал вопрос.
Текст реплик НЕ изменяй и не пересказывай. Ответ — строго JSON: {"labels": ["D", "P", ...]} — ровно по одной метке на каждую новую реплику, в том же порядке.`;

/** Назначает говорящего каждой реплике. Текст не меняется — модель возвращает только метки. */
export async function labelSpeakers(opts: {
  context: { speaker: Speaker; text: string }[];
  units: string[];
}): Promise<Speaker[]> {
  const model = process.env.DIARIZE_MODEL || LLM_MODEL;
  const ctx = opts.context.length
    ? `Предыдущие реплики (уже размечены, для контекста):\n${opts.context
        .map((c) => `${c.speaker === "doctor" ? "D" : c.speaker === "patient" ? "P" : "U"}: ${c.text}`)
        .join("\n")}\n\n`
    : "";
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: DIARIZE_PROMPT },
      { role: "user", content: `${ctx}Новые реплики для разметки (${opts.units.length}):\n${opts.units.map((u, i) => `${i + 1}. ${u}`).join("\n")}` },
    ],
  };
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  const json = (await call(
    "/chat/completions",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    30_000,
  )) as { choices?: { message?: { content?: string } }[] };
  let labels: unknown = [];
  try {
    labels = JSON.parse(json.choices?.[0]?.message?.content ?? "{}").labels;
  } catch {}
  const arr = Array.isArray(labels) ? labels : [];
  return opts.units.map((_, i) => {
    const l = String(arr[i] ?? "").trim().toUpperCase();
    return l.startsWith("D") ? "doctor" : l.startsWith("P") ? "patient" : "unknown";
  });
}

/** Типичные «галлюцинации» Whisper на тишине и шуме (фразы из субтитров видео). */
const HALLUCINATIONS = [
  /продолжение следует/i,
  /субтитр\S*\s+(сделал|создавал|делал|подготовил)/i,
  /редактор субтитров/i,
  /корректор\s+[А-ЯA-Z]/,
  /спасибо за просмотр/i,
  /подписывайтесь на (наш )?канал/i,
  /ставьте лайк/i,
  /dimatorzok/i,
  /amara\.org/i,
];

export function removeHallucinations(text: string): string {
  const sentences = text.split(/(?<=[.!?…])\s+/);
  return sentences
    .filter((s) => !HALLUCINATIONS.some((re) => re.test(s)))
    .join(" ")
    .trim();
}

const SYSTEM_PROMPT = `Ты — ассистент врача, который переносит сведения из транскрипции медицинского приёма в поля документа.
Строгие правила:
1. Заполняй ТОЛЬКО поля из переданного списка (по их key). Других ключей не добавляй.
2. Используй ТОЛЬКО сведения, прямо прозвучавшие в транскрипции. Ничего не додумывай: не ставь диагнозы, не назначай лечение, не добавляй дозировки, нормы, типовые фразы и рекомендации, которых не было.
3. Если сведений для поля нет — value: null, status: "missing".
4. Если сведения неоднозначны, противоречивы, плохо распознаны или неясно, кто их произнёс — заполни то, что прозвучало, и поставь status: "uncertain".
5. Для каждого заполненного поля приведи в evidence дословную короткую цитату из транскрипции (на языке оригинала), подтверждающую значение.
6. Значения пиши кратко, медицинским стилем, на русском языке. Отрицательные сведения («аллергии отрицает») — это тоже сведения, если они прозвучали.
7. Реплики в транскрипции размечены «Врач:» / «Пациент:» автоматически — разметка может содержать ошибки, учитывай и контекст. Строки без метки — говорящий не определён.
Ответ — строго JSON-объект вида:
{"fields": {"<key>": {"value": string | null, "status": "filled" | "uncertain" | "missing", "evidence": string | null}}}`;

const MAX_TRANSCRIPT_CHARS = 60_000;

export async function fillTemplate(opts: {
  templateName: string;
  fields: TemplateField[];
  transcript: string;
}): Promise<Record<string, DocumentFieldValue>> {
  const transcript = opts.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const fieldList = opts.fields.map((f) => ({ key: f.key, label: f.label, description: f.description }));
  const body: Record<string, unknown> = {
    model: LLM_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Документ: ${opts.templateName}\nПоля документа (JSON):\n${JSON.stringify(fieldList, null, 1)}\n\nТранскрипция приёма:\n"""\n${transcript}\n"""`,
      },
    ],
  };
  if (LLM_MODEL.startsWith("openai/gpt-oss")) body.reasoning_effort = "medium";

  const json = (await call(
    "/chat/completions",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    55_000,
  )) as { choices?: { message?: { content?: string } }[] };

  const raw = json.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError("Модель вернула ответ в неверном формате. Повторите генерацию.");
  }
  return sanitizeFields(opts.fields, parsed, transcript);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Проверка, что цитата действительно есть в транскрипции (с допуском на неточности). */
export function evidenceFound(evidence: string, transcript: string): boolean {
  const ev = normalize(evidence);
  const tr = normalize(transcript);
  if (!ev) return false;
  if (tr.includes(ev)) return true;
  const words = ev.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return false;
  const trWords = new Set(tr.split(" "));
  const hits = words.filter((w) => trWords.has(w)).length;
  return hits / words.length >= 0.7;
}

/**
 * Оставляет только поля шаблона и не допускает «уверенных» значений без подтверждения:
 * заполненное поле без цитаты из транскрипции помечается для проверки врачом.
 */
export function sanitizeFields(fields: TemplateField[], parsed: unknown, transcript: string): Record<string, DocumentFieldValue> {
  const out: Record<string, DocumentFieldValue> = {};
  const src = (parsed && typeof parsed === "object" && "fields" in parsed ? (parsed as { fields: unknown }).fields : parsed) as
    | Record<string, unknown>
    | undefined;
  for (const field of fields) {
    const item = src && typeof src === "object" ? (src[field.key] as Record<string, unknown> | undefined) : undefined;
    const value = typeof item?.value === "string" ? item.value.trim() : "";
    const evidence = typeof item?.evidence === "string" && item.evidence.trim() ? item.evidence.trim() : null;
    if (!value) {
      out[field.key] = { value: "", status: "missing", evidence: null };
      continue;
    }
    let status: DocumentFieldValue["status"] = item?.status === "filled" ? "filled" : "uncertain";
    if (status === "filled" && (!evidence || !evidenceFound(evidence, transcript))) status = "uncertain";
    out[field.key] = { value, status, evidence };
  }
  return out;
}

export type ProviderCheck = {
  ok: boolean;
  latencyMs: number | null;
  sttModel: string;
  llmModel: string;
  sttAvailable: boolean | null;
  llmAvailable: boolean | null;
  error: string | null;
  checkedAt: string;
};

let lastCheck: { at: number; result: ProviderCheck } | null = null;

/** Проверяет доступность API распознавания/ИИ, ключ и наличие моделей. Результат кэшируется на 60 с. */
export async function checkProvider(): Promise<ProviderCheck> {
  if (lastCheck && Date.now() - lastCheck.at < 60_000) return lastCheck.result;
  const base: ProviderCheck = {
    ok: false,
    latencyMs: null,
    sttModel: STT_MODEL,
    llmModel: LLM_MODEL,
    sttAvailable: null,
    llmAvailable: null,
    error: null,
    checkedAt: new Date().toISOString(),
  };
  const started = Date.now();
  let result: ProviderCheck;
  try {
    const json = (await call("/models", { method: "GET" }, 8_000)) as { data?: { id: string }[] };
    const ids = new Set((json.data ?? []).map((m) => m.id));
    const sttAvailable = ids.size ? ids.has(STT_MODEL) : null;
    const llmAvailable = ids.size ? ids.has(LLM_MODEL) : null;
    result = {
      ...base,
      latencyMs: Date.now() - started,
      sttAvailable,
      llmAvailable,
      ok: sttAvailable !== false && llmAvailable !== false,
      error:
        sttAvailable === false
          ? `Модель распознавания ${STT_MODEL} недоступна у провайдера`
          : llmAvailable === false
            ? `Модель ИИ ${LLM_MODEL} недоступна у провайдера`
            : null,
    };
  } catch (err) {
    result = { ...base, latencyMs: Date.now() - started, error: err instanceof AiError ? err.message : "Сервис недоступен" };
  }
  lastCheck = { at: Date.now(), result };
  return result;
}

const ROLES_PROMPT = `Дан фрагмент медицинского приёма, распознанный с разделением по голосам (Голос 1, Голос 2, …).
Определи роль каждого голоса: "doctor" — врач, "patient" — пациент или его представитель, "unknown" — нельзя определить (например, третий участник).
Врач расспрашивает, озвучивает осмотр, диагноз и назначения; пациент рассказывает о жалобах и самочувствии. Обычно ровно один врач.
Ответ — строго JSON: {"roles": {"<номер голоса>": "doctor" | "patient" | "unknown"}}`;

/** Сопоставляет голоса потокового распознавания с ролями «врач» / «пациент». */
export async function detectSpeakerRoles(lines: { speakerId: string; text: string }[]): Promise<Record<string, Speaker>> {
  const model = process.env.DIARIZE_MODEL || LLM_MODEL;
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ROLES_PROMPT },
      { role: "user", content: lines.map((l) => `Голос ${l.speakerId}: ${l.text}`).join("\n").slice(0, 12_000) },
    ],
  };
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  const json = (await call(
    "/chat/completions",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    30_000,
  )) as { choices?: { message?: { content?: string } }[] };
  let roles: Record<string, unknown> = {};
  try {
    roles = JSON.parse(json.choices?.[0]?.message?.content ?? "{}").roles ?? {};
  } catch {}
  const out: Record<string, Speaker> = {};
  for (const id of new Set(lines.map((l) => l.speakerId))) {
    const r = String(roles[id] ?? "").toLowerCase();
    out[id] = r === "doctor" ? "doctor" : r === "patient" ? "patient" : "unknown";
  }
  return out;
}
