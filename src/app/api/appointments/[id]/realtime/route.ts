import { api, HttpError, ok, oid } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getOwnAppointment, requireConsent } from "@/lib/appointments";
import { createTemporaryKey, SonioxError, sonioxEnabled, SONIOX_WS_URL, sonioxSessionConfig } from "@/lib/soniox";

type Ctx = { params: Promise<{ id: string }> };

/** Временный ключ и параметры сессии потокового распознавания для браузера. */
export const POST = api<Ctx>(async (_req, { params }) => {
  const user = await requireUser("doctor");
  const appt = await getOwnAppointment(oid((await params).id), user);
  if (!sonioxEnabled()) throw new HttpError(404, "Потоковое распознавание не настроено");
  if (appt.status !== "recording") throw new HttpError(409, "Запись не начата");
  await requireConsent(appt);
  try {
    const key = await createTemporaryKey(appt._id.toHexString());
    return ok({
      apiKey: key.apiKey,
      expiresAt: key.expiresAt,
      wsUrl: SONIOX_WS_URL,
      config: sonioxSessionConfig({ language: appt.language, appointmentId: appt._id.toHexString() }),
    });
  } catch (err) {
    if (err instanceof SonioxError) throw new HttpError(502, err.message);
    throw err;
  }
});
