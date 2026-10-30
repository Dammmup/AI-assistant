import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { finalizeIfReady } from "@/lib/appointments";
import { appointmentDTO, templateDTO } from "@/lib/view";
import { Workspace } from "@/components/workspace/workspace";
import { sonioxEnabled } from "@/lib/soniox";

export const metadata = { title: "Приём" };

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("doctor");
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const { appointments, templates } = await collections();
  const _id = new ObjectId(id);
  if ((await appointments.findOne({ _id, doctorId: user._id }, { projection: { status: 1 } }))?.status === "processing") {
    await finalizeIfReady(_id);
  }
  const appt = await appointments.findOne({ _id, doctorId: user._id });
  if (!appt) notFound();
  const [dto, tpl] = await Promise.all([appointmentDTO(appt), templates.find({ isActive: true }).sort({ name: 1 }).toArray()]);
  return <Workspace key={dto.id} initial={dto} templates={tpl.map(templateDTO)} realtimeAvailable={sonioxEnabled()} defaultTemplateId={user.preferences?.defaultTemplateId ?? null} />;
}
