import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { templateDTO } from "@/lib/view";
import { TemplatesManager } from "@/components/admin/templates-manager";

export default async function TemplatesPage() {
  await requirePageUser("admin");
  const { templates } = await collections();
  const list = await templates.find().sort({ createdAt: 1 }).toArray();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Шаблоны документов</h1>
      <TemplatesManager templates={list.map(templateDTO)} />
    </div>
  );
}
