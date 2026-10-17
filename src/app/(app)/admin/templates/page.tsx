import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { templateDTO } from "@/lib/view";
import { TemplatesManager } from "@/components/admin/templates-manager";
import { PageHeader } from "@/components/ui";

export default async function TemplatesPage() {
  await requirePageUser("admin");
  const { templates } = await collections();
  const list = await templates.find().sort({ createdAt: 1 }).toArray();
  return (
    <div className="space-y-4">
      <PageHeader kicker="Администрирование" title="Шаблоны документов" description="Поля шаблона и инструкции, по которым ИИ заполняет документ" />
      <TemplatesManager templates={list.map(templateDTO)} />
    </div>
  );
}
