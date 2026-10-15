import { api, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { checkProvider } from "@/lib/ai";

export const GET = api(async () => {
  await requireUser("doctor");
  return ok(await checkProvider());
});
