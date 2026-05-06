import { NextResponse } from 'next/server'
import {
  checkAnthropicProcessingAllowed,
  checkDailyBudget,
  checkMonthlyAnthropicBudget,
} from '@/lib/processing/budget'
import { canMakeBraveSearch, countBraveCallsThisMonth } from '@/lib/braveBudget'

export async function GET() {
  try {
    const [daily, monthly, anthropic, brave] = await Promise.all([
      checkDailyBudget(),
      checkMonthlyAnthropicBudget(),
      checkAnthropicProcessingAllowed(),
      canMakeBraveSearch(),
    ])
    return NextResponse.json({
      status: 'ok',
      checkedAt: new Date().toISOString(),
      anthropic: {
        dailySpentUsd: parseFloat(daily.spentUsd.toFixed(4)),
        dailyLimitUsd: 0.65,
        dailyAllowed: daily.allowed,
        monthlySpentUsd: parseFloat(monthly.spentUsd.toFixed(4)),
        monthlyLimitUsd: 20,
        monthlyAllowed: monthly.allowed,
        processingAllowed: anthropic.allowed,
        blockReason: anthropic.reason,
      },
      brave: {
        usedThisMonth: brave.usedThisMonth,
        allowed: brave.allowed,
        monthlyCap: 950,
      },
      braveCallsCounted: await countBraveCallsThisMonth(),
    })
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 })
  }
}
