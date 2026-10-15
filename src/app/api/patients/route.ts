import { api, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { collections } from "@/lib/db";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const GET = api(async (req) => {
  const user = await requireUser("doctor");
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const { patients } = await collections();
  const filter = { createdBy: user._id, ...(q ? { fullNameLower: { $regex: escape(q) } } : {}) };
  const list = await patients.find(filter).sort({ updatedAt: -1 }).limit(20).toArray();
  return ok(
    list.map((p) => ({
      id: p._id.toHexString(),
      fullName: p.fullName,
      dateOfBirth: p.dateOfBirth,
      externalPatientId: p.externalPatientId,
    })),
  );
});
