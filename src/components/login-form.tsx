"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, Button, Input, Label } from "./ui";

export function LoginForm({ configError }: { configError: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
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
    <form onSubmit={submit} className="space-y-5">
      {configError && <Alert>Сервер не настроен: {configError}</Alert>}
      <div>
        <Label htmlFor="email">Логин</Label>
        <Input id="email" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@clinic.kz" />
      </div>
      <div>
        <Label htmlFor="password">Пароль</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute top-0 right-0 flex h-9 w-9 items-center justify-center text-ink-3 hover:text-ink"
            aria-label={show ? "Скрыть пароль" : "Показать пароль"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={loading} className="h-10 w-full">
        Войти
      </Button>
    </form>
  );
}
