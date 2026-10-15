"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Input, Label } from "./ui";

export function LoginForm({ configError }: { configError: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", json: { email, password } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {configError && <Alert>Сервер не настроен: {configError}</Alert>}
      <div>
        <Label htmlFor="email">Логин (e-mail)</Label>
        <Input id="email" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={loading} className="w-full">
        Войти
      </Button>
    </form>
  );
}
