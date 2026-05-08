import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db/client'
import { getHealthStats } from '@/lib/db/queries'
import {
  checkAnthropicProcessingAllowed,
  checkDailyBudget,
  checkMonthlyAnthropicBudget,
} from '@/lib/processing/budget'
import { canMakeBraveSearch } from '@/lib/braveBudget'

export async function GET() {
  try {
    const db = createServerClient()
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [stats, anthropic, daily, monthly, brave] = await Promise.all([
      getHealthStats(),
      checkAnthropicProcessingAllowed(),
      checkDailyBudget(),
      checkMonthlyAnthropicBudget(),
      canMakeBraveSearch(),
    ])
    let discussionCandidatesResult = await db
      .from('raw_items')
      .select('source_type')
      .in('source_type', ['news', 'reddit', 'search', 'twitter', 'youtube'])
      .gte('ingested_at', cutoff24h)
    if (discussionCandidatesResult.error) {
      const maybeEnumMismatch =
        discussionCandidatesResult.error.code === '22P02' &&
        discussionCandidatesResult.error.message?.toLowerCase().includes('source_type_enum')
      if (maybeEnumMismatch) {
        discussionCandidatesResult = await db
          .from('raw_items')
          .select('source_type')
          .in('source_type', ['news', 'reddit', 'search'])
          .gte('ingested_at', cutoff24h)
      }
    }
    const [discussions24hResult, latestDiscussionResult] = await Promise.all([
      db
        .from('discussions')
        .select('id', { count: 'exact', head: true })
        .gte('ingested_at', cutoff24h),
      db
        .from('discussions')
        .select('ingested_at')
        .order('ingested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const discussionCandidates24h = (discussionCandidatesResult.data ?? []).length
    const discussionsInserted24h = discussions24hResult.count ?? 0
    const discussionCandidateQueryError = discussionCandidatesResult.error?.message ?? null
    const discussionsHealthy =
      !discussionCandidateQueryError && !(discussionCandidates24h >= 20 && discussionsInserted24h === 0)

    return NextResponse.json({
      status: discussionsHealthy ? 'ok' : 'degraded',
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
      discussions: {
        cutoff24h,
        candidateCount24h: discussionCandidates24h,
        insertedCount24h: discussionsInserted24h,
        latestSuccessfulDiscussionAt: latestDiscussionResult.data?.ingested_at ?? null,
        healthy: discussionsHealthy,
        candidateQueryError: discussionCandidateQueryError,
        unhealthyReason: discussionsHealthy
          ? null
          : discussionCandidateQueryError
            ? `Candidate query failed: ${discussionCandidateQueryError}`
            : 'No new discussions inserted in 24h despite non-trivial candidate volume.',
      },
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 })
  }
}
