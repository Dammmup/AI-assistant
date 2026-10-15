import { api, HttpError, ok, oid } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { audioExt, getOwnAppointment, requireConsent, saveSegment, setStatus } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

// Ограничение платформы Vercel на тело запроса — 4.5 МБ.
const MAX_BYTES = 4 * 1024 * 1024;

export const POST = api<Ctx>(async (req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  await requireConsent(appt);

  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Некорректные данные формы");
  });
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "Аудио не передано");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Файл больше 4 МБ. Сожмите запись или используйте запись с микрофона.");
  const mimeType = (file.type || "audio/webm").toLowerCase();
  if (!audioExt(mimeType)) throw new HttpError(415, "Неподдерживаемый формат аудио");

  const source = form.get("source") === "upload" ? "upload" : "microphone";
  const duration = Number(form.get("duration") ?? 0) || 0;
  const seqRaw = form.get("seq");
  const seq = seqRaw !== null && seqRaw !== "" ? Number(seqRaw) : undefined;
  if (seq !== undefined && (!Number.isInteger(seq) || seq < 0 || seq > 100_000)) throw new HttpError(400, "Некорректный номер фрагмента");

  if (source === "upload") {
    if (!["draft", "review"].includes(appt.status)) throw new HttpError(409, "Загрузка файла недоступна в текущем статусе приёма");
    await setStatus(appt._id, "processing", { startedAt: appt.startedAt ?? new Date(), endedAt: new Date() });
  } else if (!["recording", "processing", "review"].includes(appt.status)) {
    throw new HttpError(409, "Запись не начата");
  }

  const data = Buffer.from(await file.arrayBuffer());
  const silent = source === "microphone" && form.get("silent") === "1";
  const segment = await saveSegment({ appt, data, mimeType, durationSeconds: duration, source, seq: source === "upload" ? undefined : seq, silent });
  return ok({
    id: segment._id.toHexString(),
    seq: segment.seq,
    status: segment.status,
    text: segment.text,
    error: segment.error,
    size: segment.size,
    units: segment.units ?? [],
    speakers: segment.speakers ?? null,
    durationSeconds: segment.durationSeconds,
  });
});
