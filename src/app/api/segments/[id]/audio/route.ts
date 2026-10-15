import { Readable } from "node:stream";
import { api, HttpError, oid } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { getOwnAppointment } from "@/lib/appointments";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api<Ctx>(async (_req, { params }) => {
  const user = await requireUser("doctor");
  const { segments, audio } = await collections();
  const segment = await segments.findOne({ _id: oid((await params).id) });
  if (!segment) throw new HttpError(404, "Фрагмент не найден");
  await getOwnAppointment(segment.appointmentId, user);
  const stream = audio.openDownloadStream(segment.audioFileId);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": segment.mimeType.split(";")[0],
      "Content-Length": String(segment.size),
      "Cache-Control": "private, no-store",
    },
  });
});
