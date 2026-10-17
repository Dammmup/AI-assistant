import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { Brand } from "@/components/shell/brand";
import { SiteFooter } from "@/components/shell/footer";

export const metadata: Metadata = { title: "Вход" };

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
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between bg-sidebar px-12 py-10 lg:flex">
        <Brand tone="light" />
        <div className="max-w-md">
          <p className="text-[28px] leading-[1.25] font-medium tracking-[-0.02em] text-white">
            Врач разговаривает с пациентом. Протокол приёма пишется сам.
          </p>
          <dl className="mt-10 space-y-5 text-[14px]">
            {[
              ["Запись и расшифровка", "Речь на русском и казахском превращается в текст во время приёма, с разделением на врача и пациента."],
              ["Черновик документа", "Заключение заполняется только тем, что прозвучало. Сомнительное помечается, пустое остаётся пустым."],
              ["Решение за врачом", "Документ сохраняется только после проверки и подтверждения врачом."],
            ].map(([t, d]) => (
              <div key={t} className="border-l border-white/15 pl-4">
                <dt className="font-medium text-white">{t}</dt>
                <dd className="mt-1 leading-relaxed text-[#a7b0be]">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <SiteFooter tone="light" />
      </aside>
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[360px]">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Вход в систему</h1>
            <p className="mt-1.5 text-sm text-ink-3">Учётную запись выдаёт администратор медицинской организации.</p>
            <div className="mt-8">
              <LoginForm configError={configError} />
            </div>
          </div>
        </div>
        <SiteFooter className="lg:hidden" />
      </main>
    </div>
  );
}
