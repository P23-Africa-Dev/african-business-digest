import { createServerClient } from '@/lib/db/client'

const MONTHLY_BRAVE_CALL_CAP = 950

export async function countBraveCallsThisMonth(): Promise<number> {
  const db = createServerClient()
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const { count, error } = await db
    .from('brave_api_calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', start.toISOString())
  if (error) {
    console.warn('[BraveBudget] count failed (table may not exist yet):', error.message)
    return 0
  }
  return count ?? 0
}

export async function canMakeBraveSearch(): Promise<{ allowed: boolean; usedThisMonth: number }> {
  const usedThisMonth = await countBraveCallsThisMonth()
  return { allowed: usedThisMonth < MONTHLY_BRAVE_CALL_CAP, usedThisMonth }
}

export async function recordBraveSearchCall(query: string, ok: boolean): Promise<void> {
  const db = createServerClient()
  const { error } = await db.from('brave_api_calls').insert({ query, ok })
  if (error) console.warn('[BraveBudget] insert skipped:', error.message)
}
