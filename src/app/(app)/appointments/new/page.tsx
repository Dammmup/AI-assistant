import { requirePageUser } from "@/lib/auth";
import { NewAppointmentForm } from "@/components/new-appointment-form";

export default async function NewAppointmentPage() {
  await requirePageUser("doctor");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Новый приём</h1>
      <NewAppointmentForm />
    </div>
  );
}
