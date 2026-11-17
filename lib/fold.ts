// Accent/case-insensitive text matching for admin searches (Andreas 17-nov: "Jose" must find "José").
export const fold = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export const fuzzyIncludes = (haystack: unknown, needle: unknown): boolean => fold(haystack).includes(fold(needle).trim());
