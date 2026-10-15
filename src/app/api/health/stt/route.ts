import { api, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { checkProvider } from "@/lib/ai";
import { checkSoniox, SONIOX_MODEL, sonioxEnabled } from "@/lib/soniox";

export const GET = api(async () => {
  await requireUser("doctor");
  const [provider, soniox] = await Promise.all([checkProvider(), sonioxEnabled() ? checkSoniox() : Promise.resolve(null)]);
  return ok({ ...provider, realtime: soniox ? { ...soniox, model: SONIOX_MODEL } : null });
});
