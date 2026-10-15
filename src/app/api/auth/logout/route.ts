import { api, ok } from "@/lib/http";
import { destroySession } from "@/lib/auth";

export const POST = api(async () => {
  await destroySession();
  return ok();
});
