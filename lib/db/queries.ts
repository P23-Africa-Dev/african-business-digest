import { createServerClient } from './client'
import type { Story, Discussion, DigestData } from '@/lib/types'
import { CATEGORIES, type Category } from '@/lib/types'
import { isValidCountryFilter } from '@/lib/regions'
import { rankDiscussionsForDigest, rankStoriesByTrending } from '@/lib/trending'

function isCategoryParam(v: string | undefined): v is Category {
  return Boolean(v && (CATEGORIES as readonly string[]).includes(v))
}

function compactDbError(err: unknown) {
  if (!err || typeof err !== 'object') return err ?? null
  const e = err as { code?: string; message?: string; details?: string; hint?: string }
  return {
    code: e.code ?? null,
    message: e.message ?? null,
    details: e.details ?? null,
    hint: e.hint ?? null,
  }
}

function isEnumCategoryMismatch(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  const msg = (e.message ?? '').toLowerCase()
  return e.code === '22P02' && msg.includes('enum') && msg.includes('category_enum')
}

/** Nested embed fails when `raw_items.ingest_lane` column is missing (migration 006 not applied). */
function isIngestLaneEmbedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string; details?: string }
  const msg = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase()
  if (msg.includes('ingest_lane')) return true
  if (e.code === 'PGRST204' && msg.includes('raw_items')) return true
  return false
}

function storiesSelect(embedRawIngestLane: boolean): string {
  const rawItemsFields = embedRawIngestLane
    ? 'id, source_name, url, title, published_at, source_type, ingested_at, ingest_lane'
    : 'id, source_name, url, title, published_at, source_type, ingested_at'
  return `
        *,
        story_sources (
          id, story_id, raw_item_id, is_primary,
          raw_items ( ${rawItemsFields} )
        )
      `
}

export async function getDigest(params: {
  category?: string
  country?: string
  minRelevance?: number
}): Promise<DigestData> {
  const db = createServerClient()
  const { minRelevance = 30 } = params
  const category = isCategoryParam(params.category) ? params.category : undefined
  const country = params.country && isValidCountryFilter(params.country) ? params.country : undefined
  const storiesCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const discussionsCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  const relevanceTiers = Array.from(
    new Set([minRelevance, 20, 10].filter((v) => Number.isFinite(v) && v >= 10))
  ).sort((a, b) => b - a)

  const makeStoriesQuery = (opts: {
    withCategory: boolean
    minRelevanceFloor: number
    useCountryFallback: boolean
    embedRawIngestLane?: boolean
  }) => {
    const { withCategory, minRelevanceFloor, useCountryFallback, embedRawIngestLane = true } = opts
    let q = db
      .from('stories')
      .select(storiesSelect(embedRawIngestLane))
      .gte('relevance_score', minRelevanceFloor)
      .neq('status', 'fading')
      .gte('first_seen_at', storiesCutoff)
      .order('relevance_score', { ascending: false })
      .limit(120)
    if (withCategory && category) q = q.eq('category', category)
    if (country) {
      if (useCountryFallback && country !== 'rest_of_africa') {
        q = q.or(`country_tags.cs.{${country}},country_tags.cs.{rest_of_africa}`)
      } else {
        q = q.contains('country_tags', [country])
      }
    }
    return q
  }

  const fetchStoriesWithEmbedFallback = async (opts: {
    withCategory: boolean
    minRelevanceFloor: number
    useCountryFallback: boolean
  }) => {
    let result = await makeStoriesQuery({ ...opts, embedRawIngestLane: true })
    if (result.error && isIngestLaneEmbedError(result.error)) {
      console.warn('[DB:getDigest] Retrying without raw_items.ingest_lane in embed', compactDbError(result.error))
      result = await makeStoriesQuery({ ...opts, embedRawIngestLane: false })
    }
    return result
  }

  let discussionsQuery = db
    .from('discussions')
    .select('*')
    .order('ingested_at', { ascending: false })
    .limit(200)

  if (country) {
    discussionsQuery = discussionsQuery.contains('country_tags', [country])
  }

  type StoriesResult = Awaited<ReturnType<typeof makeStoriesQuery>>
  let storiesResult: StoriesResult | null = null
  let effectiveMinRelevance = relevanceTiers[relevanceTiers.length - 1] ?? 10
  let fallbackTier = relevanceTiers.length
  let usedCountryFallback = false
  const storyAttempts: DigestData['storyAttempts'] = []

  for (const [tierIdx, tierMin] of relevanceTiers.entries()) {
    const countryModes =
      country && country !== 'rest_of_africa' ? [false, true] : [false]
    for (const useCountryFallback of countryModes) {
      let attemptResult = await fetchStoriesWithEmbedFallback({
        withCategory: true,
        minRelevanceFloor: tierMin,
        useCountryFallback,
      })
      if (category && attemptResult.error && isEnumCategoryMismatch(attemptResult.error)) {
        console.warn('[DB:getDigest] Category enum mismatch, retrying without category filter', {
          category,
          storiesError: compactDbError(attemptResult.error),
        })
        attemptResult = await fetchStoriesWithEmbedFallback({
          withCategory: false,
          minRelevanceFloor: tierMin,
          useCountryFallback,
        })
      }

      if (attemptResult.error) {
        storiesResult = attemptResult
        break
      }

      const rows = (attemptResult.data ?? []) as unknown as Story[]
      storyAttempts?.push({
        minRelevance: tierMin,
        usedCountryFallback: useCountryFallback,
        count: rows.length,
      })
      storiesResult = attemptResult
      if (rows.length > 0) {
        effectiveMinRelevance = tierMin
        fallbackTier = tierIdx + 1
        usedCountryFallback = useCountryFallback
        break
      }
    }
    if ((storiesResult?.error ?? null) || ((storiesResult?.data ?? []).length > 0)) break
  }

  if (!storiesResult) {
    storiesResult = await fetchStoriesWithEmbedFallback({
      withCategory: true,
      minRelevanceFloor: effectiveMinRelevance,
      useCountryFallback: false,
    })
  }

  const [discussionsResult, lastIngestResult] = await Promise.all([
    discussionsQuery,
    db
      .from('raw_items')
      .select('ingested_at')
      .order('ingested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const fatalLastIngestError =
    lastIngestResult.error && (lastIngestResult.error as { code?: string }).code !== 'PGRST116'

  if (storiesResult.error || discussionsResult.error || fatalLastIngestError) {
    console.error('[DB:getDigest] Query error', {
      filters: { category: category ?? null, country: country ?? null, minRelevance },
      cutoffs: { storiesCutoff, discussionsCutoff },
      storiesError: compactDbError(storiesResult.error),
      storiesErrorRaw: storiesResult.error,
      discussionsError: compactDbError(discussionsResult.error),
      discussionsErrorRaw: discussionsResult.error,
      lastIngestError: compactDbError(lastIngestResult.error),
      lastIngestErrorRaw: lastIngestResult.error,
    })
    throw new Error('Digest query failed')
  }

  const storiesRaw = (storiesResult.data ?? []) as unknown as Story[]
  const stories = rankStoriesByTrending(storiesRaw).slice(0, 100)
  const discussionsRows = (discussionsResult.data ?? []) as Discussion[]
  const discussions = rankDiscussionsForDigest(discussionsRows, discussionsCutoff, 20)
  const lastUpdated = lastIngestResult.data?.ingested_at ?? null

  console.log('[DB:getDigest] Query success', {
    filters: { category: category ?? null, country: country ?? null, minRelevance },
    cutoffs: { storiesCutoff, discussionsCutoff },
    counts: { stories: stories.length, discussions: discussions.length },
    fallback: { effectiveMinRelevance, fallbackTier, usedCountryFallback, storyAttempts },
    lastUpdated,
  })

  return {
    stories,
    discussions,
    lastUpdated,
    storyCount: stories.length,
    effectiveMinRelevance,
    fallbackTier,
    usedCountryFallback,
    storyAttempts,
  }
}

export async function getHealthStats() {
  const db = createServerClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [storiesResult, ingestResult] = await Promise.all([
    db.from('stories').select('id', { count: 'exact' }).gte('first_seen_at', cutoff),
    db
      .from('raw_items')
      .select('ingested_at')
      .order('ingested_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (storiesResult.error || ingestResult.error) {
    console.error('[DB:getHealthStats] Query error', {
      cutoff,
      storiesError: storiesResult.error,
      ingestError: ingestResult.error,
    })
    throw new Error('Health stats query failed')
  }

  console.log('[DB:getHealthStats] Query success', {
    cutoff,
    storiesLast24h: storiesResult.count ?? 0,
    lastIngestion: ingestResult.data?.ingested_at ?? null,
  })

  return {
    storiesLast24h: storiesResult.count ?? 0,
    lastIngestion: ingestResult.data?.ingested_at ?? null,
  }
}
