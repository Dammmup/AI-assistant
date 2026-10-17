/** Склейка CSS-классов с пропуском пустых значений. */
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
