/**
 * Soniox — потоковое распознавание речи (слова появляются по мере произнесения) с разделением по голосам.
 * Браузер подключается к Soniox напрямую по WebSocket с временным ключом; основной ключ остаётся на сервере.
 */
import type { SpeechLanguage } from "./types";

const REGION = (process.env.SONIOX_REGION || "").toLowerCase();
const BASE_DOMAIN = REGION && REGION !== "us" ? `${REGION}.soniox.com` : "soniox.com";
const API_URL = (process.env.SONIOX_API_URL || `https://api.${BASE_DOMAIN}`).replace(/\/$/, "");
export const SONIOX_WS_URL = process.env.SONIOX_WS_URL || `wss://stt-rt.${BASE_DOMAIN}/transcribe-websocket`;
export const SONIOX_MODEL = process.env.SONIOX_MODEL || "stt-rt-v5";

export const sonioxEnabled = () => !!process.env.SONIOX_API_KEY && process.env.STT_ENGINE !== "groq";

export class SonioxError extends Error {}

/** Временный ключ для одной сессии распознавания в браузере. */
export async function createTemporaryKey(clientReferenceId: string, expiresInSeconds = 600): Promise<{ apiKey: string; expiresAt: string }> {
  const key = process.env.SONIOX_API_KEY;
  if (!key) throw new SonioxError("Не задан SONIOX_API_KEY");
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/auth/temporary-api-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: expiresInSeconds,
        client_reference_id: clientReferenceId,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new SonioxError(`Soniox недоступен: ${(err as Error).message}`);
  }
  const body = await res.text();
  if (!res.ok) {
    let message = body.slice(0, 200);
    try {
      const j = JSON.parse(body);
      message = j.message ?? j.error_message ?? j.error ?? message;
    } catch {}
    throw new SonioxError(`Soniox (${res.status}): ${message}`);
  }
  const json = JSON.parse(body) as { api_key: string; expires_at: string };
  return { apiKey: json.api_key, expiresAt: json.expires_at };
}

const MEDICAL_TERMS = ["анамнез", "жалобы", "диагноз", "миндалины", "тонзиллит", "ибупрофен", "парацетамол", "амоксициллин", "артериальное давление", "ЭКГ", "ОАК", "ОАМ"];

/** Сообщение конфигурации, которое браузер отправляет первым после подключения. */
export function sonioxSessionConfig(opts: { language: SpeechLanguage; appointmentId: string }) {
  // В Казахстане речь часто смешанная — подсказываем оба языка, выбранный первым.
  const hints = opts.language === "kk" ? ["kk", "ru"] : opts.language === "ru" ? ["ru", "kk"] : ["ru", "kk"];
  return {
    model: SONIOX_MODEL,
    audio_format: "auto",
    language_hints: hints,
    enable_language_identification: true,
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
    client_reference_id: opts.appointmentId,
    context: {
      general: [
        { key: "domain", value: "Медицина" },
        { key: "topic", value: "Приём пациента у врача" },
      ],
      terms: MEDICAL_TERMS,
    },
  };
}

let lastCheck: { at: number; result: { ok: boolean; latencyMs: number; error: string | null } } | null = null;

/** Проверка ключа: выпуск короткоживущего временного ключа. Результат кэшируется на 60 с. */
export async function checkSoniox(): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
  if (lastCheck && Date.now() - lastCheck.at < 60_000) return lastCheck.result;
  const started = Date.now();
  let result;
  try {
    await createTemporaryKey("healthcheck", 60);
    result = { ok: true, latencyMs: Date.now() - started, error: null };
  } catch (err) {
    result = { ok: false, latencyMs: Date.now() - started, error: (err as Error).message };
  }
  lastCheck = { at: Date.now(), result };
  return result;
}
