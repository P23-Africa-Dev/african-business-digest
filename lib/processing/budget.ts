import { createServerClient } from '@/lib/db/client'

const DAILY_BUDGET_USD = 0.65
const MONTHLY_BUDGET_USD = 20

interface UsageRow {
  tokens_in: number
  tokens_out: number
  model: string
  created_at: string
}

// Approximate costs per million tokens (May 2026 pricing)
const COST_PER_M_IN: Record<string, number> = {
  'claude-sonnet-4-6': 3.0,
  'claude-haiku-4-5': 0.8,
}
const COST_PER_M_OUT: Record<string, number> = {
  'claude-sonnet-4-6': 15.0,
  'claude-haiku-4-5': 4.0,
}

export async function recordUsage(model: string, tokensIn: number, tokensOut: number) {
  const db = createServerClient()
  await db.from('llm_usage').insert({ model, tokens_in: tokensIn, tokens_out: tokensOut })
}

function spendFromRows(rows: UsageRow[]): number {
  return rows.reduce((sum, row) => {
    const inCost = ((row.tokens_in ?? 0) / 1_000_000) * (COST_PER_M_IN[row.model] ?? 3.0)
    const outCost = ((row.tokens_out ?? 0) / 1_000_000) * (COST_PER_M_OUT[row.model] ?? 15.0)
    return sum + inCost + outCost
  }, 0)
}

export async function checkDailyBudget(): Promise<{ allowed: boolean; spentUsd: number }> {
  const db = createServerClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data } = await db
    .from('llm_usage')
    .select('tokens_in, tokens_out, model')
    .gte('created_at', cutoff)

  const rows = (data ?? []) as UsageRow[]
  const spentUsd = spendFromRows(rows)

  return { allowed: spentUsd < DAILY_BUDGET_USD, spentUsd }
}

export async function checkMonthlyAnthropicBudget(): Promise<{ allowed: boolean; spentUsd: number }> {
  const db = createServerClient()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await db
    .from('llm_usage')
    .select('tokens_in, tokens_out, model')
    .gte('created_at', cutoff)
  const spentUsd = spendFromRows((data ?? []) as UsageRow[])
  return { allowed: spentUsd < MONTHLY_BUDGET_USD, spentUsd }
}

export async function checkAnthropicProcessingAllowed(): Promise<{
  allowed: boolean
  dailySpentUsd: number
  monthlySpentUsd: number
  reason: string | null
}> {
  const [daily, monthly] = await Promise.all([checkDailyBudget(), checkMonthlyAnthropicBudget()])
  if (!daily.allowed) {
    return {
      allowed: false,
      dailySpentUsd: daily.spentUsd,
      monthlySpentUsd: monthly.spentUsd,
      reason: 'daily_budget_exceeded',
    }
  }
  if (!monthly.allowed) {
    return {
      allowed: false,
      dailySpentUsd: daily.spentUsd,
      monthlySpentUsd: monthly.spentUsd,
      reason: 'monthly_budget_exceeded',
    }
  }
  return {
    allowed: true,
    dailySpentUsd: daily.spentUsd,
    monthlySpentUsd: monthly.spentUsd,
    reason: null,
  }
}
