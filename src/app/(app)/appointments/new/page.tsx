import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth";
import { NewAppointmentForm } from "@/components/new-appointment-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Новый приём" };

export default async function NewAppointmentPage() {
  const user = await requirePageUser("doctor");
  return (
    <div className="max-w-[720px]">
      <PageHeader kicker="Журнал" title="Новый приём" description="Укажите пациента. Запись и согласие — на следующем шаге." />
      <NewAppointmentForm defaultLanguage={user.preferences?.defaultLanguage ?? "ru"} />
    </div>
  );
}
