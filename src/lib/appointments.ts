import { ObjectId } from "mongodb";
import { Readable } from "node:stream";
import { collections } from "./db";
import { HttpError } from "./http";
import { AiError, PROVIDER, transcribeAudio } from "./ai";
import type { SessionUser } from "./auth";
import type { AppointmentDoc, AppointmentStatus, SegmentDoc, TranscriptDoc } from "./types";

/** Фрагмент считается «зависшим», если обработка не завершилась за это время (например, оборвалось соединение). */
const STALE_PENDING_MS = 2 * 60_000;

export async function getOwnAppointment(id: ObjectId, user: SessionUser): Promise<AppointmentDoc> {
  const { appointments } = await collections();
  const appt = await appointments.findOne({ _id: id });
  // Врач видит только свои приёмы; администратор управляет системой, но не медицинскими записями.
  if (!appt || !appt.doctorId.equals(user._id)) throw new HttpError(404, "Приём не найден");
  return appt;
}

export function assertStatus(appt: AppointmentDoc, allowed: AppointmentStatus[], action: string) {
  if (!allowed.includes(appt.status)) {
    throw new HttpError(409, `Действие «${action}» недоступно в текущем статусе приёма`);
  }
}

export async function setStatus(id: ObjectId, status: AppointmentStatus, extra: Partial<AppointmentDoc> = {}) {
  const { appointments } = await collections();
  await appointments.updateOne({ _id: id }, { $set: { status, updatedAt: new Date(), ...extra } });
}

export async function requireConsent(appt: AppointmentDoc) {
  const { consents } = await collections();
  const consent = appt.consentId ? await consents.findOne({ _id: appt.consentId }) : null;
  if (!consent || consent.status !== "obtained") {
    throw new HttpError(409, "Сначала зафиксируйте согласие пациента на обработку данных");
  }
}

export async function ensureTranscript(appt: AppointmentDoc, recordingId: ObjectId | null, provider = PROVIDER): Promise<TranscriptDoc> {
  const { transcripts } = await collections();
  const now = new Date();
  const res = await transcripts.findOneAndUpdate(
    { appointmentId: appt._id },
    {
      $setOnInsert: {
        appointmentId: appt._id,
        text: "",
        language: appt.language,
        status: "empty",
        isEdited: false,
        editedBy: null,
        editedAt: null,
        createdAt: now,
        ...(recordingId ? {} : { recordingId: null, provider }),
      },
      $set: { updatedAt: now, ...(recordingId ? { recordingId, provider } : {}) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return res!;
}

export async function ensureRecording(appt: AppointmentDoc) {
  const { recordings } = await collections();
  const now = new Date();
  const _id = new ObjectId();
  const res = await recordings.findOneAndUpdate(
    { appointmentId: appt._id },
    {
      $setOnInsert: {
        _id,
        appointmentId: appt._id,
        storageKey: `gridfs:audio/${_id.toHexString()}`,
        durationSeconds: 0,
        format: "audio/webm",
        segmentsCount: 0,
        createdAt: now,
      },
      $set: { status: "recording", updatedAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  return res!;
}

function composeText(segments: Pick<SegmentDoc, "status" | "text">[]) {
  return segments
    .filter((s) => s.status === "done" && s.text)
    .map((s) => s.text.trim())
    .join("\n");
}

/** Пересобирает текст транскрипции из распознанных фрагментов, если врач его ещё не редактировал. */
async function syncTranscript(appointmentId: ObjectId, appendText?: string) {
  const { transcripts, segments } = await collections();
  const transcript = await transcripts.findOne({ appointmentId });
  if (!transcript) return;
  const segs = await segments.find({ appointmentId }, { sort: { seq: 1 }, projection: { status: 1, text: 1, updatedAt: 1 } }).toArray();
  const now = Date.now();
  const pending = segs.some((s) => s.status === "pending" && now - s.updatedAt.getTime() < STALE_PENDING_MS);
  const failed = segs.some((s) => s.status === "failed" || (s.status === "pending" && now - s.updatedAt.getTime() >= STALE_PENDING_MS));
  const status: TranscriptDoc["status"] = pending ? "in_progress" : failed ? "partial" : segs.length ? "ready" : transcript.status;
  if (transcript.isEdited) {
    const update: Partial<TranscriptDoc> = { status, updatedAt: new Date() };
    if (appendText) update.text = `${transcript.text.trimEnd()}\n${appendText}`.trim();
    await transcripts.updateOne({ _id: transcript._id }, { $set: update });
  } else {
    await transcripts.updateOne({ _id: transcript._id }, { $set: { text: composeText(segs), status, updatedAt: new Date() } });
  }
}

/** Если запись остановлена и все фрагменты обработаны — переводит приём в статус проверки. */
export async function finalizeIfReady(appointmentId: ObjectId) {
  const { appointments, segments, recordings } = await collections();
  const appt = await appointments.findOne({ _id: appointmentId });
  if (!appt || appt.status !== "processing") return;
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
  const pending = await segments.countDocuments({ appointmentId, status: "pending", updatedAt: { $gt: staleBefore } });
  if (pending > 0) return;
  const failed = await segments.countDocuments({ appointmentId, status: { $in: ["failed", "pending"] } });
  await recordings.updateOne({ appointmentId }, { $set: { status: failed ? "partial" : "ready", updatedAt: new Date() } });
  await syncTranscript(appointmentId);
  await appointments.updateOne({ _id: appointmentId, status: "processing" }, { $set: { status: "review", updatedAt: new Date() } });
}

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

export function audioExt(mime: string) {
  return EXT[mime.split(";")[0].trim().toLowerCase()] ?? null;
}

/**
 * Сначала сохраняет аудио, затем распознаёт. Ошибка распознавания не теряет аудио:
 * фрагмент помечается как failed и может быть обработан повторно.
 */
export async function saveSegment(opts: {
  appt: AppointmentDoc;
  data: Buffer;
  mimeType: string;
  durationSeconds: number;
  source: SegmentDoc["source"];
  seq?: number;
  /** Тишина по оценке браузера: аудио сохраняется, но не отправляется в распознавание (Whisper «галлюцинирует» на тишине). */
  silent?: boolean;
}): Promise<SegmentDoc> {
  const { segments, recordings, audio } = await collections();
  const recording = await ensureRecording(opts.appt);
  await ensureTranscript(opts.appt, recording._id);
  const ext = audioExt(opts.mimeType) ?? "webm";

  // Идемпотентность: повторная отправка того же фрагмента (seq) после обрыва связи не создаёт дубликат.
  if (opts.seq !== undefined) {
    const existing = await segments.findOne({ recordingId: recording._id, seq: opts.seq });
    if (existing) {
      if (existing.status === "failed") return processSegment(existing);
      return existing;
    }
  }

  const seq =
    opts.seq ??
    ((await segments.find({ recordingId: recording._id }).sort({ seq: -1 }).limit(1).next())?.seq ?? -1) + 1;

  const audioFileId = new ObjectId();
  await new Promise<void>((resolve, reject) => {
    Readable.from(opts.data)
      .pipe(
        audio.openUploadStreamWithId(audioFileId, `${recording._id.toHexString()}-${seq}.${ext}`, {
          metadata: { recordingId: recording._id, appointmentId: opts.appt._id, seq, contentType: opts.mimeType },
        }),
      )
      .on("finish", () => resolve())
      .on("error", reject);
  });

  const now = new Date();
  const segment: SegmentDoc = {
    _id: new ObjectId(),
    recordingId: recording._id,
    appointmentId: opts.appt._id,
    seq,
    source: opts.source,
    audioFileId,
    mimeType: opts.mimeType,
    size: opts.data.length,
    durationSeconds: Math.max(0, Math.round(opts.durationSeconds * 10) / 10),
    status: "pending",
    text: "",
    error: null,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await segments.insertOne(segment);
  } catch (err) {
    await audio.delete(audioFileId).catch(() => {});
    if ((err as { code?: number }).code === 11000) {
      return (await segments.findOne({ recordingId: recording._id, seq }))!;
    }
    throw err;
  }
  await recordings.updateOne(
    { _id: recording._id },
    {
      $inc: { segmentsCount: 1, durationSeconds: segment.durationSeconds },
      $set: { format: opts.mimeType.split(";")[0], updatedAt: now },
    },
  );
  if (opts.silent) {
    const { segments: segs } = await collections();
    const done = await segs.findOneAndUpdate(
      { _id: segment._id },
      { $set: { status: "done", text: "", updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    await syncTranscript(segment.appointmentId);
    await finalizeIfReady(segment.appointmentId);
    return done!;
  }
  return processSegment(segment, opts.data);
}

async function readAudio(fileId: ObjectId): Promise<Buffer> {
  const { audio } = await collections();
  const chunks: Buffer[] = [];
  for await (const chunk of audio.openDownloadStream(fileId)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function processSegment(segment: SegmentDoc, data?: Buffer): Promise<SegmentDoc> {
  const { segments, appointments } = await collections();
  const appt = await appointments.findOne({ _id: segment.appointmentId });
  if (!appt) throw new HttpError(404, "Приём не найден");
  await segments.updateOne({ _id: segment._id }, { $set: { status: "pending", updatedAt: new Date() }, $inc: { attempts: 1 } });

  const prev = await segments.findOne({ recordingId: segment.recordingId, seq: { $lt: segment.seq }, status: "done" }, { sort: { seq: -1 } });
  let update: Partial<SegmentDoc>;
  try {
    const text = await transcribeAudio({
      data: data ?? (await readAudio(segment.audioFileId)),
      mimeType: segment.mimeType.split(";")[0],
      filename: `segment-${segment.seq}.${audioExt(segment.mimeType) ?? "webm"}`,
      language: appt.language,
      previousText: prev?.text,
    });
    update = { status: "done", text, error: null };
  } catch (err) {
    if (!(err instanceof AiError)) console.error(err);
    update = { status: "failed", error: err instanceof AiError ? err.message : "Ошибка распознавания" };
  }
  const updated = await segments.findOneAndUpdate(
    { _id: segment._id },
    { $set: { ...update, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  // Если врач уже правил текст, новый распознанный фрагмент дописывается в конец, а не перезаписывает правки.
  await syncTranscript(segment.appointmentId, update.status === "done" ? update.text : undefined);
  await finalizeIfReady(segment.appointmentId);
  return updated!;
}
