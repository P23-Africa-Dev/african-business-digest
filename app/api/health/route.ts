import { NextResponse } from 'next/server'
import { getHealthStats } from '@/lib/db/queries'
import {
  checkAnthropicProcessingAllowed,
  checkDailyBudget,
  checkMonthlyAnthropicBudget,
} from '@/lib/processing/budget'
import { canMakeBraveSearch } from '@/lib/braveBudget'

export async function GET() {
  try {
    const [stats, anthropic, daily, monthly, brave] = await Promise.all([
      getHealthStats(),
      checkAnthropicProcessingAllowed(),
      checkDailyBudget(),
      checkMonthlyAnthropicBudget(),
      canMakeBraveSearch(),
    ])
    return NextResponse.json({
      status: 'ok',
      ...stats,
      budget: {
        spentTodayUsd: parseFloat(daily.spentUsd.toFixed(4)),
        dailyLimitUsd: 0.65,
        dailyAllowed: daily.allowed,
        spentMonthUsd: parseFloat(monthly.spentUsd.toFixed(4)),
        monthlyLimitUsd: 20,
        monthlyAllowed: monthly.allowed,
        llmProcessingAllowed: anthropic.allowed,
        llmBlockReason: anthropic.reason,
        braveCallsThisMonth: brave.usedThisMonth,
        braveMonthlyCap: 950,
        braveAllowed: brave.allowed,
      },
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 })
  }
}
