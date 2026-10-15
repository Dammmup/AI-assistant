"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, fmtDateTime } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/labels";
import { Alert, Badge, Button, Card, Input, Label, Select } from "../ui";

type UserRow = { id: string; fullName: string; email: string; role: "doctor" | "admin"; isActive: boolean; createdAt: string };

export function UsersManager({ users, meId }: { users: UserRow[]; meId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "doctor" as "doctor" | "admin" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setLoading(key);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setLoading(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (await run("create", () => apiFetch("/api/admin/users", { method: "POST", json: form }))) {
      setForm({ fullName: "", email: "", password: "", role: "doctor" });
    }
  }

  const patch = (id: string, json: object) => run(id, () => apiFetch(`/api/admin/users/${id}`, { method: "PATCH", json }));

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Card title="Учётные записи">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">ФИО</th>
                <th className="py-2 pr-3">Логин</th>
                <th className="py-2 pr-3">Роль</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2 pr-3">Создан</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium">{u.fullName}</td>
                  <td className="py-2 pr-3">{u.email}</td>
                  <td className="py-2 pr-3">
                    <Select
                      className="w-auto py-1"
                      value={u.role}
                      disabled={u.id === meId || loading === u.id}
                      onChange={(e) => patch(u.id, { role: e.target.value })}
                    >
                      <option value="doctor">{ROLE_LABEL.doctor}</option>
                      <option value="admin">{ROLE_LABEL.admin}</option>
                    </Select>
                  </td>
                  <td className="py-2 pr-3">{u.isActive ? <Badge tone="green">Активен</Badge> : <Badge tone="red">Отключён</Badge>}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{fmtDateTime(u.createdAt)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const password = prompt(`Новый пароль для ${u.email} (не короче 8 символов):`);
                        if (password) void patch(u.id, { password });
                      }}
                    >
                      Сменить пароль
                    </Button>
                    {u.id !== meId && (
                      <Button size="sm" variant="secondary" loading={loading === u.id} onClick={() => patch(u.id, { isActive: !u.isActive })}>
                        {u.isActive ? "Отключить" : "Включить"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Новый пользователь">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="u-name">ФИО</Label>
            <Input id="u-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="u-email">Логин (e-mail)</Label>
            <Input id="u-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="u-pass">Пароль</Label>
            <Input
              id="u-pass"
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="u-role">Роль</Label>
            <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "doctor" | "admin" })}>
              <option value="doctor">{ROLE_LABEL.doctor}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={loading === "create"}>
              Создать пользователя
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
