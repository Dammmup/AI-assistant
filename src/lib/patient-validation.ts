/**
 * Проверка ФИО и даты рождения пациента. Используется и в форме (браузер), и в API (сервер).
 */

// Кириллица (включая казахские буквы) и латиница.
const CYR = "А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі";
const LAT = "A-Za-z";
const WORD = new RegExp(`^[${CYR}${LAT}]+(?:['’\\-][${CYR}${LAT}]+)*$`);
const HAS_CYR = new RegExp(`[${CYR}]`);
const HAS_LAT = new RegExp(`[${LAT}]`);

/** Частицы, которые пишутся со строчной буквы: «Мамед оглы», «Айгерім Сейітқызы» пишется слитно и сюда не относится. */
const PARTICLES = new Set(["оглы", "оглу", "кызы", "қызы", "улы", "ұлы", "уулу", "ибн", "бин", "фон", "де", "ван", "дер", "ла"]);

const capitalize = (w: string) =>
  w
    .split(/(['’-])/)
    .map((p) => (p === "-" || p === "'" || p === "’" ? p : p.charAt(0).toLocaleUpperCase("ru") + p.slice(1).toLocaleLowerCase("ru")))
    .join("");

/** Убирает лишние пробелы, приводит дефисы и регистр: «иванова-петрова  анна» → «Иванова-Петрова Анна». */
export function normalizeFullName(raw: string): string {
  return raw
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => (PARTICLES.has(w.toLocaleLowerCase("ru")) ? w.toLocaleLowerCase("ru") : capitalize(w)))
    .join(" ");
}

/** Возвращает текст ошибки или null, если ФИО корректно. */
export function validateFullName(raw: string): string | null {
  const name = normalizeFullName(raw ?? "");
  if (!name) return "Укажите ФИО пациента";
  if (/\d/.test(name)) return "ФИО не должно содержать цифр";
  if (/\./.test(name) || name.split(" ").some((w) => w.length === 1)) return "Укажите ФИО полностью, без инициалов";
  const words = name.split(" ");
  const bad = words.find((w) => !WORD.test(w));
  if (bad) return `Недопустимые символы в «${bad}»: используйте буквы, пробел и дефис`;
  const mixed = words.find((w) => HAS_CYR.test(w) && HAS_LAT.test(w));
  if (mixed) return `В слове «${mixed}» смешаны русские и латинские буквы — проверьте раскладку`;
  const significant = words.filter((w) => !PARTICLES.has(w.toLocaleLowerCase("ru")));
  if (significant.length < 2) return "Укажите как минимум фамилию и имя";
  if (words.length > 5) return "Слишком много слов — проверьте ФИО";
  if (name.length > 120) return "ФИО слишком длинное";
  if (significant.some((w) => w.replace(/['’-]/g, "").length < 2)) return "Каждая часть ФИО — не короче двух букв";
  return null;
}

/** Сегодняшняя дата YYYY-MM-DD в часовом поясе Казахстана (на сервере) или в поясе браузера. */
export function todayIso(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // en-CA даёт формат YYYY-MM-DD
}

export const MAX_AGE = 125;

/** Возвращает текст ошибки или null. Пустая дата допустима (поле необязательное). */
export function validateBirthDate(iso: string | null | undefined, today = todayIso()): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "Введите дату в формате ДД.ММ.ГГГГ";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "Такой даты не существует";
  if (iso > today) return "Дата рождения не может быть в будущем";
  if (ageOn(iso, today) > MAX_AGE) return `Проверьте год рождения — возраст больше ${MAX_AGE} лет`;
  return null;
}

/** Полных лет на дату today. */
export function ageOn(iso: string, today = todayIso()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export function formatAge(age: number): string {
  const n = Math.abs(age) % 100;
  const n1 = n % 10;
  const word = n > 10 && n < 20 ? "лет" : n1 === 1 ? "год" : n1 >= 2 && n1 <= 4 ? "года" : "лет";
  return age < 1 ? "меньше года" : `${age} ${word}`;
}
