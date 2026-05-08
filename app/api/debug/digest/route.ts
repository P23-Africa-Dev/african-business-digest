import { NextResponse } from 'next/server'
import { getDigest } from '@/lib/db/queries'
import { createServerClient } from '@/lib/db/client'
import type { Category } from '@/lib/types'
import { getLastDiscussionProcessSnapshot } from '@/lib/processing/discussions'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const category = (url.searchParams.get('category') ?? undefined) as Category | undefined
  const country = url.searchParams.get('country') ?? undefined
  const minRelevanceRaw = url.searchParams.get('minRelevance')
  const minRelevance = minRelevanceRaw ? Number(minRelevanceRaw) : 30

  const db = createServerClient()
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const [
    rawItems24hResult,
    rawItems48hResult,
    stories24hResult,
    stories48hResult,
    discussions24hResult,
    discussions48hResult,
    latestRawResult,
    latestStoryResult,
    latestDiscussionResult,
  ] = await Promise.all([
    db.from('raw_items').select('id', { count: 'exact', head: true }).gte('ingested_at', cutoff24h),
    db.from('raw_items').select('id', { count: 'exact', head: true }).gte('ingested_at', cutoff48h),
    db.from('stories').select('id', { count: 'exact', head: true }).gte('first_seen_at', cutoff24h),
    db.from('stories').select('id', { count: 'exact', head: true }).gte('first_seen_at', cutoff48h),
    db.from('discussions').select('id', { count: 'exact', head: true }).gte('ingested_at', cutoff24h),
    db.from('discussions').select('id', { count: 'exact', head: true }).gte('ingested_at', cutoff48h),
    db.from('raw_items').select('id, ingested_at').order('ingested_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('stories').select('id, first_seen_at, last_updated_at').order('first_seen_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('discussions').select('id, ingested_at, posted_at').order('ingested_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  let discussionCandidates24hResult = await db
    .from('raw_items')
    .select('source_type')
    .in('source_type', ['news', 'reddit', 'search', 'twitter', 'youtube'])
    .gte('ingested_at', cutoff24h)
    .limit(2000)
  if (discussionCandidates24hResult.error) {
    const maybeEnumMismatch =
      discussionCandidates24hResult.error.code === '22P02' &&
      discussionCandidates24hResult.error.message?.toLowerCase().includes('source_type_enum')
    if (maybeEnumMismatch) {
      discussionCandidates24hResult = await db
        .from('raw_items')
        .select('source_type')
        .in('source_type', ['news', 'reddit', 'search'])
        .gte('ingested_at', cutoff24h)
        .limit(2000)
    }
  }

  const dbErrors = {
    rawItems24h: rawItems24hResult.error?.message ?? null,
    rawItems48h: rawItems48hResult.error?.message ?? null,
    stories24h: stories24hResult.error?.message ?? null,
    stories48h: stories48hResult.error?.message ?? null,
    discussions24h: discussions24hResult.error?.message ?? null,
    discussions48h: discussions48hResult.error?.message ?? null,
    latestRaw: latestRawResult.error?.message ?? null,
    latestStory: latestStoryResult.error?.message ?? null,
    latestDiscussion: latestDiscussionResult.error?.message ?? null,
    discussionCandidates24h: discussionCandidates24hResult.error?.message ?? null,
  }

  const candidatesBySource24h = (discussionCandidates24hResult.data ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      const sourceType = row.source_type ?? 'unknown'
      acc[sourceType] = (acc[sourceType] ?? 0) + 1
      return acc
    },
    {}
  )
  const discussionSnapshot = getLastDiscussionProcessSnapshot()

  let digestSummary: {
    stories: number
    discussions: number
    storyCount: number
    lastUpdated: string | null
    effectiveMinRelevance: number | null
    fallbackTier: number | null
    usedCountryFallback: boolean
    storyAttempts: Array<{
      minRelevance: number
      usedCountryFallback: boolean
      count: number
    }>
    error: string | null
  } = {
    stories: 0,
    discussions: 0,
    storyCount: 0,
    lastUpdated: null,
    effectiveMinRelevance: null,
    fallbackTier: null,
    usedCountryFallback: false,
    storyAttempts: [],
    error: null,
  }

  try {
    const digest = await getDigest({ category, country, minRelevance })
    digestSummary = {
      stories: digest.stories.length,
      discussions: digest.discussions.length,
      storyCount: digest.storyCount,
      lastUpdated: digest.lastUpdated,
      effectiveMinRelevance: digest.effectiveMinRelevance ?? null,
      fallbackTier: digest.fallbackTier ?? null,
      usedCountryFallback: digest.usedCountryFallback ?? false,
      storyAttempts: digest.storyAttempts ?? [],
      error: null,
    }
  } catch (err) {
    digestSummary.error = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({
    status: 'ok',
    checkedAt: new Date().toISOString(),
    filters: { category: category ?? null, country: country ?? null, minRelevance },
    cutoffs: { cutoff24h, cutoff48h },
    counts: {
      rawItems: { last24h: rawItems24hResult.count ?? 0, last48h: rawItems48hResult.count ?? 0 },
      stories: { last24h: stories24hResult.count ?? 0, last48h: stories48hResult.count ?? 0 },
      discussions: {
        last24h: discussions24hResult.count ?? 0,
        last48h: discussions48hResult.count ?? 0,
      },
      discussionCandidates24h: {
        total: (discussionCandidates24hResult.data ?? []).length,
        bySource: candidatesBySource24h,
      },
    },
    latest: {
      rawItem: latestRawResult.data ?? null,
      story: latestStoryResult.data ?? null,
      discussion: latestDiscussionResult.data ?? null,
    },
    diagnostics: {
      acceptedDiscussionsLast24h: discussions24hResult.count ?? 0,
      latestSuccessfulDiscussionAt: latestDiscussionResult.data?.ingested_at ?? null,
      likelyStarved:
        (discussionCandidates24hResult.data ?? []).length > 0 && (discussions24hResult.count ?? 0) === 0,
      lastRunProcessingStats: discussionSnapshot?.stats ?? null,
      lastRunProcessingStatsUpdatedAt: discussionSnapshot?.updatedAt ?? null,
      upsertErrorSummary: discussionSnapshot?.stats.upsertError ?? null,
    },
    digest: digestSummary,
    errors: dbErrors,
  })
}
