/**
 * Нормализует UUID: 32 hex с черточками или без, любой регистр.
 */
export function normalizeUuidParam(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const compact = raw.trim().toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(compact)) return null;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

/**
 * Нормализует UUID доски из query-параметра: допускаются 32 hex с черточками или без, любой регистр.
 */
export function normalizeBoardIdQueryParam(raw: string | null | undefined): string | null {
  return normalizeUuidParam(raw);
}
