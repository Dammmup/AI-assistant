"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { PAYWALL_EVENT, PAYWALL_MESSAGE, PAYWALL_TITLE, isLockedPage } from "@/lib/paywall";
import { Button } from "./ui";

const ALLOW = "[data-paywall-allow]";

/** Действие закрыто до оплаты? Кнопки и ссылки на закрытые разделы — да; просмотр, аудиоплеер, навигация — нет. */
function blocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest(ALLOW)) return false;
  const link = target.closest("a[href]");
  if (link) {
    const url = new URL((link as HTMLAnchorElement).href, location.href);
    return url.origin === location.origin && isLockedPage(url.pathname);
  }
  return !!target.closest("button, input[type=submit]");
}

/**
 * Ограниченный режим: любое действие (кнопка, ссылка на закрытый раздел) вместо выполнения показывает окно об оплате.
 * Сервер в этом режиме сам отклоняет все изменения, окно — только понятное объяснение.
 */
export function PaywallGuard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!blocked(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      if ((e.target as Element).closest(ALLOW)) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    const show = () => setOpen(true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(PAYWALL_EVENT, show);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(PAYWALL_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div data-paywall-allow className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4" onClick={() => setOpen(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        aria-describedby="paywall-text"
        className="w-full max-w-[460px] border border-ink bg-sheet shadow-[6px_6px_0_rgba(26,25,23,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-2 border-signal px-6 pt-5 pb-3">
          <Lock className="h-4 w-4 text-signal" strokeWidth={2.25} />
          <h2 id="paywall-title" className="kicker text-signal">
            {PAYWALL_TITLE}
          </h2>
        </div>
        <p id="paywall-text" className="px-6 py-5 font-serif text-[18px] leading-[1.5] text-ink">
          {PAYWALL_MESSAGE}
        </p>
        <div className="flex justify-end border-t border-line px-6 py-4">
          <Button autoFocus onClick={() => setOpen(false)}>
            Понятно
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Полоса под шапкой: напоминание об ограниченном режиме. */
export function PaywallBanner() {
  return (
    <div className="no-print border-b border-signal/40 bg-signal/[0.06]">
      <p className="mx-auto flex max-w-[1240px] items-center gap-2 px-5 py-2 text-[13px] text-[#7d2014] sm:px-8">
        <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        Ограниченный доступ: доступен просмотр сохранённых приёмов и прослушивание записей.
      </p>
    </div>
  );
}

/** Содержимое закрытого раздела. */
export function LockedNotice({ title }: { title: string }) {
  return (
    <div className="border-y border-ink px-6 py-14 text-center">
      <Lock className="mx-auto h-6 w-6 text-signal" strokeWidth={2} />
      <p className="kicker mt-4 text-signal">{title}</p>
      <p className="mx-auto mt-3 max-w-[520px] font-serif text-[18px] leading-[1.5] text-ink">{PAYWALL_MESSAGE}</p>
    </div>
  );
}
