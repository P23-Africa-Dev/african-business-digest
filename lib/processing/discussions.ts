import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/db/client'
import { LLM_COUNTRY_TAG_HINTS } from '@/lib/regions'
import { DiscussionFilterSchema } from './schemas'
import { recordUsage } from './budget'
import type { SourceType } from '@/lib/types'

const DB_SAFE_CATEGORIES = new Set([
  'fintech',
  'logistics',
  'energy',
  'retail',
  'deals_funding',
  'policy',
  'business_failures',
  'society',
  'trending',
])
const CATEGORY_FALLBACK_MAP: Record<string, string> = {
  agriculture: 'retail',
  consumer_markets: 'retail',
  infrastructure: 'logistics',
}

function toDbSafeCategory(category: string | null | undefined): string | null {
  if (!category) return null
  if (DB_SAFE_CATEGORIES.has(category)) return category
  return CATEGORY_FALLBACK_MAP[category] ?? 'policy'
}

const DISCUSSION_SOURCE_TYPES: SourceType[] = ['news', 'reddit', 'search', 'twitter', 'youtube']
const LEGACY_DISCUSSION_SOURCE_TYPES: SourceType[] = ['news', 'reddit', 'search']
const BUSINESS_SIGNAL_TERMS = [
  'startup',
  'funding',
  'investment',
  'fintech',
  'bank',
  'acquisition',
  'merger',
  'market',
  'ipo',
  'economy',
  'policy',
  'regulation',
  'logistics',
  'infrastructure',
  'retail',
  'energy',
  'profit',
  'revenue',
  'deal',
  'venture',
]
const DISCUSSION_PREFERRED_DOMAINS = [
  'techcabal.com',
  'businessday.ng',
  'disruptafrica.com',
  'venturesafrica.com',
  'theafricareport.com',
  'semafor.com',
  'restofworld.org',
  'itnewsafrica.com',
  'reddit.com',
  'x.com',
  'twitter.com',
]
const MAX_CANDIDATES_FOR_LLM = 100

type DiscussionCandidate = {
  id: string
  url: string
  title: string
  raw_content: string | null
  source_type: SourceType
  source_name: string
  country_tags: string[]
  published_at: string | null
  engagement_score: number
  ingest_lane?: string | null
}

export type DiscussionProcessStats = {
  cutoffIso: string
  candidateCount: number
  candidatesBySource: Record<string, number>
  prefilteredCount: number
  prefilteredBySource: Record<string, number>
  llmReturnedCount: number
  relevantCount: number
  upsertedCount: number
  upsertError: string | null
}

export type DiscussionProcessResult = {
  processedCount: number
  stats: DiscussionProcessStats
}

type DiscussionProcessSnapshot = {
  updatedAt: string
  stats: DiscussionProcessStats
}

let lastDiscussionProcessSnapshot: DiscussionProcessSnapshot | null = null

export function getLastDiscussionProcessSnapshot(): DiscussionProcessSnapshot | null {
  return lastDiscussionProcessSnapshot
}

function toSourceCounts(rows: Array<{ source_type: string }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.source_type] = (acc[row.source_type] ?? 0) + 1
    return acc
  }, {})
}

function scoreDiscussionCandidate(candidate: DiscussionCandidate): number {
  const blob = `${candidate.title} ${candidate.raw_content ?? ''}`.toLowerCase()
  let score = 0
  for (const term of BUSINESS_SIGNAL_TERMS) {
    if (blob.includes(term)) score += 2
  }
  if ((candidate.engagement_score ?? 0) > 0) score += Math.min(8, Math.ceil(candidate.engagement_score / 10))
  if (candidate.ingest_lane === 'business_core') score += 4
  if (candidate.source_type === 'reddit') score += 4
  if (candidate.source_type === 'search') score += 2
  if (candidate.source_type === 'news') score += 1
  if (
    DISCUSSION_PREFERRED_DOMAINS.some((domain) => {
      const source = candidate.source_name.toLowerCase()
      const url = candidate.url.toLowerCase()
      return source.includes(domain) || url.includes(domain)
    })
  ) {
    score += 2
  }
  return score
}

const SYSTEM_PROMPT = `You are a filter for African discussions online (business and broader trending).

Given an indexed list of Reddit posts and web content, identify which ones merit inclusion in a daily digest.

For each item return:
- index: the original index number from the input (required)
- is_business_relevant: true if it discusses real business activity, startups, markets, investment, economic policy, business failures, OR (when the input item has ingest_lane "trending_broad") substantive national news: elections, major government actions, currency/economy, infrastructure, or civic events with clear public impact
- excerpt: 1-2 sentence paraphrased summary (neutral tone, no direct quotes)
- country_tags: array using only these slugs: ${LLM_COUNTRY_TAG_HINTS}
- category: one of fintech/logistics/energy/retail/deals_funding/policy/business_failures/agriculture/infrastructure/consumer_markets/society/trending, or null

Return valid JSON only: { "discussions": [ { "index": 0, "is_business_relevant": true, ... }, ... ] }`

export async function processDiscussions(): Promise<DiscussionProcessResult> {
  const db = createServerClient()
  // Haiku for this lighter filtering pass — ~5x cheaper than Sonnet
  const client = new Anthropic()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const baseStats: DiscussionProcessStats = {
    cutoffIso: cutoff,
    candidateCount: 0,
    candidatesBySource: {},
    prefilteredCount: 0,
    prefilteredBySource: {},
    llmReturnedCount: 0,
    relevantCount: 0,
    upsertedCount: 0,
    upsertError: null,
  }

  let rawItemsQuery = await db
    .from('raw_items')
    .select('id, url, title, raw_content, source_type, source_name, country_tags, published_at, engagement_score, ingest_lane')
    .in('source_type', DISCUSSION_SOURCE_TYPES)
    .gte('ingested_at', cutoff)
    .order('ingested_at', { ascending: false })
    .limit(300)
  if (rawItemsQuery.error) {
    const maybeEnumMismatch =
      rawItemsQuery.error.code === '22P02' &&
      rawItemsQuery.error.message?.toLowerCase().includes('source_type_enum')
    if (maybeEnumMismatch) {
      rawItemsQuery = await db
        .from('raw_items')
        .select('id, url, title, raw_content, source_type, source_name, country_tags, published_at, engagement_score, ingest_lane')
        .in('source_type', LEGACY_DISCUSSION_SOURCE_TYPES)
        .gte('ingested_at', cutoff)
        .order('ingested_at', { ascending: false })
        .limit(300)
    }
  }
  if (rawItemsQuery.error?.message?.includes('ingest_lane')) {
    for (const types of [DISCUSSION_SOURCE_TYPES, LEGACY_DISCUSSION_SOURCE_TYPES]) {
      const fallbackRes = await db
        .from('raw_items')
        .select('id, url, title, raw_content, source_type, source_name, country_tags, published_at, engagement_score')
        .in('source_type', types)
        .gte('ingested_at', cutoff)
        .order('ingested_at', { ascending: false })
        .limit(300)
      rawItemsQuery = fallbackRes as typeof rawItemsQuery
      if (!rawItemsQuery.error) break
    }
  }
  if (rawItemsQuery.error) {
    baseStats.upsertError = `candidate_query_failed: ${rawItemsQuery.error.message}`
    lastDiscussionProcessSnapshot = { updatedAt: new Date().toISOString(), stats: baseStats }
    return { processedCount: 0, stats: baseStats }
  }

  const rawCandidates = (rawItemsQuery.data ?? []).map((row) => ({
    ...(row as DiscussionCandidate),
    ingest_lane: (row as DiscussionCandidate).ingest_lane ?? 'business_core',
  }))
  baseStats.candidateCount = rawCandidates.length
  baseStats.candidatesBySource = toSourceCounts(rawCandidates)
  if (rawCandidates.length === 0) {
    lastDiscussionProcessSnapshot = { updatedAt: new Date().toISOString(), stats: baseStats }
    return { processedCount: 0, stats: baseStats }
  }

  const scored = rawCandidates
    .map((item) => ({ item, score: scoreDiscussionCandidate(item) }))
    .sort((a, b) => b.score - a.score)
  const prefilteredItems = scored
    .filter(({ score }, idx) => score >= 2 || idx < 20)
    .slice(0, MAX_CANDIDATES_FOR_LLM)
    .map(({ item }) => item)

  baseStats.prefilteredCount = prefilteredItems.length
  baseStats.prefilteredBySource = toSourceCounts(prefilteredItems)
  if (prefilteredItems.length === 0) {
    lastDiscussionProcessSnapshot = { updatedAt: new Date().toISOString(), stats: baseStats }
    return { processedCount: 0, stats: baseStats }
  }

  // Use index instead of URL — Claude often drops or mutates URLs in responses
  const itemsForLLM = prefilteredItems.map((item, idx) => ({
    index: idx,
    title: item.title,
    snippet: item.raw_content?.slice(0, 500) ?? null,
    source: item.source_name,
    country_hints: item.country_tags,
    ingest_lane: item.ingest_lane ?? 'business_core',
  }))

  let parsed
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Filter and tag these ${prefilteredItems.length} items:\n\n${JSON.stringify(itemsForLLM, null, 2)}\n\nReturn JSON: { "discussions": [...] }`,
        },
      ],
    })
    await recordUsage('claude-haiku-4-5', response.usage.input_tokens, response.usage.output_tokens)

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : rawText
    parsed = DiscussionFilterSchema.parse(JSON.parse(jsonStr))
  } catch (err) {
    console.error('[Discussions] LLM processing failed:', err)
    baseStats.upsertError = err instanceof Error ? err.message : String(err)
    lastDiscussionProcessSnapshot = { updatedAt: new Date().toISOString(), stats: baseStats }
    return { processedCount: 0, stats: baseStats }
  }

  baseStats.llmReturnedCount = parsed.discussions.length
  const relevant = parsed.discussions.filter((d) => d.is_business_relevant)
  baseStats.relevantCount = relevant.length
  if (relevant.length === 0) {
    lastDiscussionProcessSnapshot = { updatedAt: new Date().toISOString(), stats: baseStats }
    return { processedCount: 0, stats: baseStats }
  }

  const toInsert = relevant
    .map((d) => {
      const rawItem = prefilteredItems[d.index]
      if (!rawItem) return null
      return {
        platform: rawItem.source_name ?? 'unknown',
        url: rawItem.url,
        title: rawItem.title,
        excerpt: d.excerpt ?? null,
        engagement_score: Math.min(100, Math.max(0, Number(rawItem.engagement_score) || 0)),
        country_tags: d.country_tags,
        category: toDbSafeCategory(d.category),
        posted_at: rawItem.published_at ?? null,
        ingested_at: new Date().toISOString(),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const { error } = await db
    .from('discussions')
    .upsert(toInsert, { onConflict: 'url', ignoreDuplicates: false })

  if (error) {
    console.error('[Discussions] Upsert failed:', error)
    baseStats.upsertError = error.message
    lastDiscussionProcessSnapshot = { updatedAt: new Date().toISOString(), stats: baseStats }
    return { processedCount: 0, stats: baseStats }
  }

  baseStats.upsertedCount = toInsert.length
  lastDiscussionProcessSnapshot = { updatedAt: new Date().toISOString(), stats: baseStats }
  return { processedCount: relevant.length, stats: baseStats }
}
