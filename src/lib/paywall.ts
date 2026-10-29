/**
 * Ограниченный режим до оплаты (ACCESS_LOCKED=1): доступен только просмотр сохранённых приёмов
 * и прослушивание записей. Создание, изменение и служебные разделы закрыты на сервере.
 * Модуль без серверных зависимостей — используется и в proxy, и в браузере.
 */

export const PAYWALL_TITLE = "Внимание";
export const PAYWALL_MESSAGE =
  "Для тестирования функций оплатите переводом по номеру 87478313398 Дамир Б. 130 000 тенге. После оплаты вы получите доступ к проекту.";

/** Только на сервере. */
export const isAccessLocked = () => process.env.ACCESS_LOCKED === "1";

/** Страницы, закрытые целиком: их содержимое не отдаётся вовсе. */
export function isLockedPage(path: string) {
  return (
    path === "/appointments/new" ||
    path === "/account" ||
    path.startsWith("/account/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/print/")
  );
}

/** API, доступное в ограниченном режиме: вход/выход и чтение приёмов с аудио. */
export function isAllowedApi(method: string, path: string) {
  if (path.startsWith("/api/auth/")) return true;
  if (method !== "GET" && method !== "HEAD") return false;
  return (
    path === "/api/appointments" ||
    /^\/api\/appointments\/[a-f0-9]{24}$/.test(path) ||
    /^\/api\/segments\/[a-f0-9]{24}\/audio$/.test(path) ||
    path === "/api/health" ||
    path === "/api/health/stt"
  );
}

/** Событие в браузере: показать окно об оплате. */
export const PAYWALL_EVENT = "ms:paywall";
