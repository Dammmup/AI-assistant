"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";
import type { TemplateDTO } from "@/lib/dto";
import type { TemplateField } from "@/lib/types";
import { Alert, Badge, Button, Card, Input, Label, Textarea } from "../ui";

type Editable = Omit<TemplateDTO, "id" | "version"> & { id?: string };

const EMPTY: Editable = {
  name: "",
  documentType: "",
  description: "",
  isActive: true,
  fields: [{ key: "complaints", label: "Жалобы", description: "", required: false, multiline: true }],
};

export function TemplatesManager({ templates }: { templates: TemplateDTO[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editable | null>(null);

  return (
    <div className="space-y-4">
      {!editing && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setEditing(structuredClone(EMPTY))}>+ Новый шаблон</Button>
          </div>
          {templates.map((t) => (
            <Card
              key={t.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {t.name} <Badge>v{t.version}</Badge>
                  {t.isActive ? <Badge tone="green">Доступен</Badge> : <Badge tone="red">Отключён</Badge>}
                </span>
              }
              actions={
                <Button size="sm" variant="secondary" onClick={() => setEditing(structuredClone(t))}>
                  Изменить
                </Button>
              }
            >
              {t.description && <p className="mb-2 text-sm text-slate-600">{t.description}</p>}
              <p className="text-sm text-slate-500">
                Тип: <code>{t.documentType}</code> · Поля: {t.fields.map((f) => f.label).join(", ")}
              </p>
            </Card>
          ))}
        </>
      )}
      {editing && (
        <TemplateEditor
          value={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ value, onCancel, onSaved }: { value: Editable; onCancel: () => void; onSaved: () => void }) {
  const [t, setT] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = (i: number, patch: Partial<TemplateField>) => setT({ ...t, fields: t.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const move = (i: number, d: -1 | 1) => {
    const fields = [...t.fields];
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    setT({ ...t, fields });
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { id, ...body } = t;
      await apiFetch(id ? `/api/admin/templates/${id}` : "/api/admin/templates", { method: id ? "PUT" : "POST", json: body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={t.id ? "Изменение шаблона" : "Новый шаблон"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Название</Label>
          <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        </div>
        <div>
          <Label>Тип документа (код)</Label>
          <Input value={t.documentType} onChange={(e) => setT({ ...t, documentType: e.target.value })} placeholder="consultation" />
        </div>
        <div className="sm:col-span-2">
          <Label>Описание</Label>
          <Input value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={t.isActive} onChange={(e) => setT({ ...t, isActive: e.target.checked })} />
          Доступен врачам
        </label>
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold">Поля документа</h3>
      <p className="mb-3 text-xs text-slate-500">
        Описание поля передаётся ИИ как инструкция: что именно извлекать из транскрипции. Изменение шаблона повышает его версию; уже созданные документы не
        меняются.
      </p>
      <div className="space-y-3">
        {t.fields.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Название поля" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            <Input placeholder="ключ (латиница)" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} />
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)} title="Выше">
                ↑
              </Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)} title="Ниже">
                ↓
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setT({ ...t, fields: t.fields.filter((_, j) => j !== i) })} title="Удалить">
                ✕
              </Button>
            </div>
            <Textarea
              className="sm:col-span-3"
              rows={2}
              placeholder="Инструкция для ИИ: какие сведения относятся к этому полю"
              value={f.description}
              onChange={(e) => setField(i, { description: e.target.value })}
            />
            <div className="flex gap-4 text-sm sm:col-span-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                Обязательное
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={f.multiline} onChange={(e) => setField(i, { multiline: e.target.checked })} />
                Многострочное
              </label>
            </div>
          </div>
        ))}
      </div>
      <Button
        className="mt-3"
        variant="secondary"
        size="sm"
        onClick={() => setT({ ...t, fields: [...t.fields, { key: "", label: "", description: "", required: false, multiline: true }] })}
      >
        + Добавить поле
      </Button>
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mt-6 flex gap-2">
        <Button onClick={save} loading={saving}>
          Сохранить
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </Card>
  );
}
