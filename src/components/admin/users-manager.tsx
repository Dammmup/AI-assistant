"use client";

import { Fragment, useState } from "react";
import { KeyRound } from "lucide-react";
import { Avatar } from "../shell/avatar";
import { useRouter } from "next/navigation";
import { apiFetch, fmtDateTime } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/labels";
import { Alert, Badge, Button, Card, Input, Label, Select, cx } from "../ui";

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: "doctor" | "admin";
  isActive: boolean;
  createdAt: string;
  position: string | null;
  avatarColor: string | null;
};

export function UsersManager({ users, meId }: { users: UserRow[]; meId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "doctor" as "doctor" | "admin" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

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
    <div className="space-y-12">
      {error && <Alert>{error}</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="kicker border-y border-ink text-left text-ink-3">
              <th className="py-2.5 pr-4 font-normal">Сотрудник</th>
              <th className="py-2.5 pr-4 font-normal">Роль</th>
              <th className="py-2.5 pr-4 font-normal">Статус</th>
              <th className="hidden py-2.5 pr-4 font-normal md:table-cell">Создан</th>
              <th className="py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr className={cx("border-b border-line", !u.isActive && "text-ink-3")}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} color={u.avatarColor} />
                      <div className="min-w-0 leading-tight">
                        <div className="font-medium text-ink">
                          {u.fullName}
                          {u.id === meId && <span className="ml-1.5 text-xs font-normal text-ink-3">(вы)</span>}
                        </div>
                        <div className="text-[13px] text-ink-3">
                          {u.email}
                          {u.position ? ` · ${u.position}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Select
                      className="h-8 w-auto text-[13px]"
                      value={u.role}
                      disabled={u.id === meId || loading === u.id}
                      onChange={(e) => patch(u.id, { role: e.target.value })}
                    >
                      <option value="doctor">{ROLE_LABEL.doctor}</option>
                      <option value="admin">{ROLE_LABEL.admin}</option>
                    </Select>
                  </td>
                  <td className="py-3 pr-4">{u.isActive ? <Badge tone="green">Активен</Badge> : <Badge tone="red">Отключён</Badge>}</td>
                  <td className="hidden py-3 pr-4 font-mono text-[13px] whitespace-nowrap text-ink-3 tabular md:table-cell">{fmtDateTime(u.createdAt)}</td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setResetFor(resetFor === u.id ? null : u.id)}>
                      <KeyRound className="h-4 w-4" /> Пароль
                    </Button>
                    {u.id !== meId && (
                      <Button size="sm" variant="secondary" loading={loading === u.id} onClick={() => patch(u.id, { isActive: !u.isActive })}>
                        {u.isActive ? "Отключить" : "Включить"}
                      </Button>
                    )}
                  </td>
                </tr>
                {resetFor === u.id && (
                  <tr className="border-b border-line bg-sheet">
                    <td colSpan={5} className="px-4 py-3">
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (await patch(u.id, { password: newPassword })) {
                            setResetFor(null);
                            setNewPassword("");
                          }
                        }}
                      >
                        <span className="kicker text-ink-2">Новый пароль для {u.email}</span>
                        <Input
                          type="text"
                          className="h-8 max-w-60"
                          minLength={8}
                          required
                          autoFocus
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="не короче 8 символов"
                        />
                        <Button size="sm" type="submit" loading={loading === u.id}>
                          Сохранить
                        </Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => setResetFor(null)}>
                          Отмена
                        </Button>
                        <span className="text-xs text-ink-3">Все сеансы пользователя будут завершены.</span>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Card title="Новый пользователь">
        <form onSubmit={create} className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
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
