import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { Brand } from "@/components/shell/brand";
import { SiteFooter } from "@/components/shell/footer";

export const metadata: Metadata = { title: "Вход" };

const POINTS = [
  ["Запись и расшифровка", "Речь на русском и казахском превращается в текст прямо во время приёма — с разделением на врача и пациента."],
  ["Черновик заключения", "Поля заполняются только тем, что прозвучало. Сомнительное помечается, пустое остаётся пустым."],
  ["Подпись врача", "Документ сохраняется только после проверки и подтверждения врачом."],
];

export default async function LoginPage() {
  let user = null;
  let configError: string | null = null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    configError = (err as Error).message;
  }
  if (user) redirect("/");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <Brand />
          <span className="kicker hidden text-ink-3 sm:block">Медицинская документация</span>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-[1240px] flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="hidden flex-col justify-center border-r border-ink px-8 py-16 lg:flex xl:pr-20">
          <p className="kicker text-ink-3">Форма 001 · Протокол приёма</p>
          <h1 className="mt-5 max-w-[540px] font-serif text-[44px] leading-[1.08] font-semibold tracking-[-0.02em]">
            Врач говорит с&nbsp;пациентом. Протокол пишется сам.
          </h1>
          <ol className="mt-12 max-w-[520px] border-t border-ink">
            {POINTS.map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[48px_1fr] border-b border-line py-4">
                <span className="kicker pt-1 text-signal">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-3">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="flex items-center justify-center px-5 py-16 sm:px-8">
          <div className="w-full max-w-[380px]">
            <p className="kicker text-ink-3">Вход в систему</p>
            <h2 className="mt-3 font-serif text-[30px] leading-tight font-semibold">Добрый день</h2>
            <p className="mt-2 text-[14px] text-ink-3">Учётную запись выдаёт администратор медицинской организации.</p>
            <div className="mt-10">
              <LoginForm configError={configError} />
            </div>
          </div>
        </section>
      </main>
      <div className="mx-auto w-full max-w-[1240px] px-5 pb-6 sm:px-8">
        <div className="border-t border-ink pt-4">
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
