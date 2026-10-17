import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui";
import { AccountSettings } from "@/components/account-settings";

export const metadata: Metadata = { title: "Мой профиль" };

export default async function AccountPage() {
  const user = await requirePageUser();
  const { templates } = await collections();
  const tpl = user.role === "doctor" ? await templates.find({ isActive: true }, { projection: { name: 1 } }).sort({ name: 1 }).toArray() : [];
  return (
    <div className="max-w-[820px]">
      <PageHeader title="Мой профиль" description="Личные данные, настройки работы и безопасность учётной записи" />
      <AccountSettings
        user={{
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          roleLabel: ROLE_LABEL[user.role],
          position: user.position ?? "",
          organization: user.organization ?? "",
          defaultLanguage: user.preferences?.defaultLanguage ?? "ru",
          defaultTemplateId: user.preferences?.defaultTemplateId ?? "",
          avatarColor: user.preferences?.avatarColor ?? null,
        }}
        templates={tpl.map((t) => ({ id: t._id.toHexString(), name: t.name }))}
      />
    </div>
  );
}
