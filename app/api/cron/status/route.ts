import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db/client'
import { getLastDiscussionProcessSnapshot } from '@/lib/processing/discussions'

export async function GET() {
  const db = createServerClient()
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [latestRunResult, latestDiscussionResult, discussions24hResult] = await Promise.all([
    db
      .from('raw_items')
      .select('ingested_at')
      .order('ingested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('discussions')
      .select('ingested_at')
      .order('ingested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('discussions')
      .select('id', { count: 'exact', head: true })
      .gte('ingested_at', cutoff24h),
  ])
  let candidateRowsResult = await db
    .from('raw_items')
    .select('source_type')
    .in('source_type', ['news', 'reddit', 'search', 'twitter', 'youtube'])
    .gte('ingested_at', cutoff24h)
    .limit(1000)
  if (candidateRowsResult.error) {
    const maybeEnumMismatch =
      candidateRowsResult.error.code === '22P02' &&
      candidateRowsResult.error.message?.toLowerCase().includes('source_type_enum')
    if (maybeEnumMismatch) {
      candidateRowsResult = await db
        .from('raw_items')
        .select('source_type')
        .in('source_type', ['news', 'reddit', 'search'])
        .gte('ingested_at', cutoff24h)
        .limit(1000)
    }
  }

  if (latestRunResult.error || candidateRowsResult.error || latestDiscussionResult.error || discussions24hResult.error) {
    return NextResponse.json(
      {
        error:
          latestRunResult.error?.message ??
          candidateRowsResult.error?.message ??
          latestDiscussionResult.error?.message ??
          discussions24hResult.error?.message ??
          'Unknown status query error',
      },
      { status: 500 }
    )
  }

  const candidatesBySource = (candidateRowsResult.data ?? []).reduce<Record<string, number>>((acc, row) => {
    const sourceType = row.source_type ?? 'unknown'
    acc[sourceType] = (acc[sourceType] ?? 0) + 1
    return acc
  }, {})

  const { data } = latestRunResult
  const lastRunAt = data?.ingested_at ?? null
  const lastDiscussionAt = latestDiscussionResult.data?.ingested_at ?? null
  const discussionsLast24h = discussions24hResult.count ?? 0
  const discussionSnapshot = getLastDiscussionProcessSnapshot()

  const todayUtc = new Date().toISOString().slice(0, 10)
  const ranToday = lastRunAt ? new Date(lastRunAt).toISOString().slice(0, 10) === todayUtc : false

  return NextResponse.json({
    ranToday,
    lastRunAt,
    discussionDiagnostics: {
      cutoff24h,
      candidateCount: (candidateRowsResult.data ?? []).length,
      candidatesBySource,
      discussionsLast24h,
      latestSuccessfulDiscussionAt: lastDiscussionAt,
      likelyStarved: (candidateRowsResult.data ?? []).length > 0 && discussionsLast24h === 0,
      lastRunProcessingStats: discussionSnapshot?.stats ?? null,
      lastRunProcessingStatsUpdatedAt: discussionSnapshot?.updatedAt ?? null,
      upsertErrorSummary: discussionSnapshot?.stats.upsertError ?? null,
    },
  })
}
