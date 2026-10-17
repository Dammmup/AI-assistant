"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { LANGUAGE_LABEL } from "@/lib/labels";
import { Alert, Button, Input, Label, Select, cx } from "./ui";
import { Avatar, AVATAR_COLORS } from "./shell/avatar";

type Props = {
  user: {
    fullName: string;
    email: string;
    role: "doctor" | "admin";
    roleLabel: string;
    position: string;
    organization: string;
    defaultLanguage: "ru" | "kk" | "auto";
    defaultTemplateId: string;
    avatarColor: string | null;
  };
  templates: { id: string; name: string }[];
};

/** Блок настроек: описание слева, форма справа. */
function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-b border-line py-8 first:pt-2 last:border-b-0 md:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function useAction() {
  const [state, setState] = useState<{ loading: boolean; error: string | null; done: boolean }>({ loading: false, error: null, done: false });
  const run = async (fn: () => Promise<unknown>) => {
    setState({ loading: true, error: null, done: false });
    try {
      await fn();
      setState({ loading: false, error: null, done: true });
      setTimeout(() => setState((s) => ({ ...s, done: false })), 3000);
      return true;
    } catch (err) {
      setState({ loading: false, error: (err as Error).message, done: false });
      return false;
    }
  };
  return { ...state, run };
}

const Saved = ({ show, text = "Сохранено" }: { show: boolean; text?: string }) =>
  show ? (
    <span className="inline-flex items-center gap-1 text-[13px] text-[#22573a]">
      <Check className="h-4 w-4" /> {text}
    </span>
  ) : null;

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute top-0 right-0 flex h-9 w-9 items-center justify-center text-ink-3 hover:text-ink"
        aria-label={show ? "Скрыть пароль" : "Показать пароль"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function passwordStrength(p: string) {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-zа-яё]/.test(p) && /[A-ZА-ЯЁ]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^\p{L}\p{N}]/u.test(p)) score++;
  return Math.min(4, score);
}
const STRENGTH = ["Слишком короткий", "Слабый", "Средний", "Хороший", "Надёжный"];

export function AccountSettings({ user, templates }: Props) {
  const router = useRouter();

  // Профиль и персонализация
  const [profile, setProfile] = useState({
    fullName: user.fullName,
    position: user.position,
    organization: user.organization,
    defaultLanguage: user.defaultLanguage,
    defaultTemplateId: user.defaultTemplateId,
    avatarColor: user.avatarColor,
  });
  const profileAction = useAction();
  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    void profileAction
      .run(() =>
        apiFetch("/api/account", {
          method: "PATCH",
          json: {
            fullName: profile.fullName,
            position: profile.position || null,
            organization: profile.organization || null,
            preferences: {
              defaultLanguage: profile.defaultLanguage,
              defaultTemplateId: profile.defaultTemplateId || null,
              avatarColor: profile.avatarColor,
            },
          },
        }),
      )
      .then((ok) => ok && router.refresh());
  };

  // Логин
  const [email, setEmail] = useState({ value: user.email, current: user.email, password: "" });
  const emailAction = useAction();
  const saveEmail = (e: React.FormEvent) => {
    e.preventDefault();
    void emailAction
      .run(() => apiFetch("/api/account/email", { method: "POST", json: { email: email.value, currentPassword: email.password } }))
      .then((ok) => ok && setEmail((s) => ({ ...s, current: s.value.trim().toLowerCase(), value: s.value.trim().toLowerCase(), password: "" })));
  };

  // Пароль
  const [pw, setPw] = useState({ current: "", next: "", repeat: "" });
  const pwAction = useAction();
  const strength = passwordStrength(pw.next);
  const mismatch = pw.repeat.length > 0 && pw.next !== pw.repeat;
  const savePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.repeat) return;
    void pwAction
      .run(() => apiFetch("/api/account/password", { method: "POST", json: { currentPassword: pw.current, newPassword: pw.next } }))
      .then((ok) => ok && setPw({ current: "", next: "", repeat: "" }));
  };

  const sessionsAction = useAction();

  return (
    <div>
      <Row title="Профиль" description="Как вас видят коллеги. ФИО и должность печатаются в подписи медицинских документов.">
        <form onSubmit={saveProfile} className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={profile.fullName || user.fullName} color={profile.avatarColor} size="lg" />
            <div>
              <p className="mb-2 text-[13px] text-ink-3">Цвет аватара</p>
              <div className="flex flex-wrap gap-1.5">
                {AVATAR_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setProfile({ ...profile, avatarColor: c })}
                    className={cx(
                      "h-6 w-6 rounded-full ring-offset-2 transition",
                      profile.avatarColor === c ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line-2",
                    )}
                    style={{ background: c }}
                    aria-label={`Цвет ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName">ФИО</Label>
              <Input id="fullName" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} required minLength={3} />
            </div>
            <div>
              <Label htmlFor="position" hint="печатается в документах">
                Должность
              </Label>
              <Input
                id="position"
                value={profile.position}
                onChange={(e) => setProfile({ ...profile, position: e.target.value })}
                placeholder={user.role === "doctor" ? "Врач-терапевт" : "Администратор системы"}
              />
            </div>
            <div>
              <Label htmlFor="org" hint="для печатных форм">
                Организация
              </Label>
              <Input
                id="org"
                value={profile.organization}
                onChange={(e) => setProfile({ ...profile, organization: e.target.value })}
                placeholder="ТОО «Клиника»"
              />
            </div>
            {user.role === "doctor" && (
              <>
                <div>
                  <Label htmlFor="lang">Язык речи по умолчанию</Label>
                  <Select
                    id="lang"
                    value={profile.defaultLanguage}
                    onChange={(e) => setProfile({ ...profile, defaultLanguage: e.target.value as typeof profile.defaultLanguage })}
                  >
                    {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tpl">Шаблон документа по умолчанию</Label>
                  <Select id="tpl" value={profile.defaultTemplateId} onChange={(e) => setProfile({ ...profile, defaultTemplateId: e.target.value })}>
                    <option value="">Первый в списке</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
          </div>
          {profileAction.error && <Alert>{profileAction.error}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={profileAction.loading}>
              Сохранить профиль
            </Button>
            <Saved show={profileAction.done} />
          </div>
        </form>
      </Row>

      <Row title="Логин" description="Используется для входа. Для смены подтвердите действие текущим паролем.">
        <form onSubmit={saveEmail} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="email">Новый логин</Label>
              <Input id="email" value={email.value} onChange={(e) => setEmail({ ...email, value: e.target.value })} autoComplete="username" required />
            </div>
            <div>
              <Label htmlFor="email-pw">Текущий пароль</Label>
              <PasswordInput
                id="email-pw"
                value={email.password}
                onChange={(e) => setEmail({ ...email, password: e.target.value })}
                autoComplete="current-password"
                required
              />
            </div>
          </div>
          {emailAction.error && <Alert>{emailAction.error}</Alert>}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="secondary"
              loading={emailAction.loading}
              disabled={email.value.trim().toLowerCase() === email.current || !email.password}
            >
              Сменить логин
            </Button>
            <Saved show={emailAction.done} text="Логин изменён" />
          </div>
        </form>
      </Row>

      <Row title="Пароль" description="Не короче 8 символов. После смены пароля все другие сеансы будут завершены.">
        <form onSubmit={savePassword} className="space-y-4">
          <div className="max-w-sm">
            <Label htmlFor="pw-cur">Текущий пароль</Label>
            <PasswordInput id="pw-cur" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pw-new">Новый пароль</Label>
              <PasswordInput id="pw-new" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required minLength={8} />
              {pw.next && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cx(
                          "h-1 flex-1 rounded-full",
                          i < strength ? (strength <= 1 ? "bg-[#b9443a]" : strength === 2 ? "bg-[#c48a1d]" : "bg-[#3b8a5c]") : "bg-line",
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-ink-3">{pw.next.length < 8 ? STRENGTH[0] : STRENGTH[strength]}</p>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="pw-rep">Повторите новый пароль</Label>
              <PasswordInput id="pw-rep" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} autoComplete="new-password" required />
              {mismatch && <p className="mt-1 text-xs text-[#8a2922]">Пароли не совпадают</p>}
            </div>
          </div>
          {pwAction.error && <Alert>{pwAction.error}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" loading={pwAction.loading} disabled={!pw.current || pw.next.length < 8 || pw.next !== pw.repeat}>
              Сменить пароль
            </Button>
            <Saved show={pwAction.done} text="Пароль изменён" />
          </div>
        </form>
      </Row>

      <Row title="Сеансы" description="Если вы входили с чужого компьютера или забыли выйти — завершите все сеансы, кроме текущего.">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={sessionsAction.loading}
            onClick={() => void sessionsAction.run(() => apiFetch("/api/account/sessions", { method: "POST" }))}
          >
            Выйти на всех других устройствах
          </Button>
          <Saved show={sessionsAction.done} text="Другие сеансы завершены" />
        </div>
        {sessionsAction.error && (
          <div className="mt-3">
            <Alert>{sessionsAction.error}</Alert>
          </div>
        )}
        <p className="mt-4 text-[13px] text-ink-3">
          Роль: {user.roleLabel}. Роль и доступ меняет администратор.
        </p>
      </Row>
    </div>
  );
}
