/** Categories guaranteed on DBs that only ran migration 001 (core business set). */
const CORE_CATEGORY_ENUM = new Set([
  'fintech',
  'logistics',
  'energy',
  'retail',
  'deals_funding',
  'policy',
  'business_failures',
])

/** Added in migration 003 — map to core if insert fails. */
const EXTENDED_CATEGORY_ENUM = new Set(['agriculture', 'infrastructure', 'consumer_markets'])

/** Added in migration 007 — map to policy until applied. */
const SOCIETY_TRENDING_ENUM = new Set(['society', 'trending'])

const CATEGORY_FALLBACK_MAP: Record<string, string> = {
  agriculture: 'retail',
  consumer_markets: 'retail',
  infrastructure: 'logistics',
  society: 'policy',
  trending: 'policy',
}

export function toDbSafeCategory(category: string | null | undefined): string {
  if (!category) return 'policy'
  if (CORE_CATEGORY_ENUM.has(category)) return category
  if (EXTENDED_CATEGORY_ENUM.has(category)) return category
  if (SOCIETY_TRENDING_ENUM.has(category)) return category
  return CATEGORY_FALLBACK_MAP[category] ?? 'policy'
}

/** Use when DB rejects society/trending or extended categories (migration not applied). */
export function toDbSafeCategoryStrict(category: string | null | undefined): string {
  const normalized = toDbSafeCategory(category)
  if (CORE_CATEGORY_ENUM.has(normalized)) return normalized
  if (EXTENDED_CATEGORY_ENUM.has(normalized)) return CATEGORY_FALLBACK_MAP[normalized] ?? 'policy'
  if (SOCIETY_TRENDING_ENUM.has(normalized)) return 'policy'
  return CATEGORY_FALLBACK_MAP[normalized] ?? 'policy'
}

export function isCategoryEnumMismatch(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  const msg = (e.message ?? '').toLowerCase()
  return e.code === '22P02' && msg.includes('enum') && msg.includes('category')
}
