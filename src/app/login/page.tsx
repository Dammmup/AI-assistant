import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">М</div>
          <h1 className="text-xl font-semibold">МедПротокол</h1>
          <p className="mt-1 text-sm text-slate-500">ИИ-ассистент медицинской документации</p>
        </div>
        <LoginForm configError={configError} />
        <p className="mt-6 text-center text-xs text-slate-400">Демонстрационная версия. Используйте тестовые данные пациентов.</p>
      </div>
    </main>
  );
}
