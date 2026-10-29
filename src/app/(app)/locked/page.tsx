import { redirect } from "next/navigation";
import { isAccessLocked } from "@/lib/paywall";
import { LockedNotice } from "@/components/paywall";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Доступ ограничен" };

/** Сюда proxy перенаправляет закрытые разделы в ограниченном режиме; адрес в браузере не меняется. */
export default function LockedPage() {
  if (!isAccessLocked()) redirect("/");
  return (
    <div>
      <PageHeader kicker="Раздел закрыт" title="Доступ ограничен" />
      <LockedNotice title="Раздел недоступен" />
    </div>
  );
}
