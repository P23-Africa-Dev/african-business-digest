import { createServerClient } from '@/lib/db/client'
import { ingestRSS } from './rss'
import { ingestReddit } from './reddit'
import { ingestSearch } from './search'
import { ingestTwitter } from './twitter'
import { ingestYoutube } from './youtube'
import type { RawItem } from '@/lib/types'

export interface IngestResult {
  rss: number
  reddit: number
  search: number
  twitter: number
  youtube: number
  total: number
  persisted: number
  sourceBreakdown: Record<string, { fetched: number; deduped: number; persisted: number }>
  errors: string[]
}

export async function runIngestion(): Promise<IngestResult> {
  const db = createServerClient()
  const errors: string[] = []
  const hasRedditCreds = Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)
  const redditTask = hasRedditCreds ? ingestReddit() : Promise.resolve([])

  if (!hasRedditCreds) {
    console.info('[Ingest] Skipping Reddit ingestion: missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET')
  }

  const [rssResult, redditResult, searchResult, twitterResult, youtubeResult] = await Promise.allSettled([
    ingestRSS(),
    redditTask,
    ingestSearch(),
    ingestTwitter(),
    ingestYoutube(),
  ])

  const rssItems = rssResult.status === 'fulfilled' ? rssResult.value : []
  const redditItems = redditResult.status === 'fulfilled' ? redditResult.value : []
  const searchItems = searchResult.status === 'fulfilled' ? searchResult.value : []
  const twitterItems = twitterResult.status === 'fulfilled' ? twitterResult.value : []
  const youtubeItems = youtubeResult.status === 'fulfilled' ? youtubeResult.value : []

  if (rssResult.status === 'rejected') {
    errors.push(`RSS: ${rssResult.reason}`)
    console.error('[Ingest] RSS module failed:', rssResult.reason)
  }
  if (redditResult.status === 'rejected') {
    errors.push(`Reddit: ${redditResult.reason}`)
    console.error('[Ingest] Reddit module failed:', redditResult.reason)
  }
  if (searchResult.status === 'rejected') {
    errors.push(`Search: ${searchResult.reason}`)
    console.error('[Ingest] Search module failed:', searchResult.reason)
  }
  if (twitterResult.status === 'rejected') {
    errors.push(`Twitter: ${twitterResult.reason}`)
    console.error('[Ingest] Twitter module failed:', twitterResult.reason)
  }
  if (youtubeResult.status === 'rejected') {
    errors.push(`YouTube: ${youtubeResult.reason}`)
    console.error('[Ingest] YouTube module failed:', youtubeResult.reason)
  }

  const allItems: RawItem[] = [...rssItems, ...redditItems, ...searchItems, ...twitterItems, ...youtubeItems]
  const sourceBreakdown: Record<string, { fetched: number; deduped: number; persisted: number }> = {
    news: { fetched: rssItems.length, deduped: 0, persisted: 0 },
    reddit: { fetched: redditItems.length, deduped: 0, persisted: 0 },
    search: { fetched: searchItems.length, deduped: 0, persisted: 0 },
    twitter: { fetched: twitterItems.length, deduped: 0, persisted: 0 },
    youtube: { fetched: youtubeItems.length, deduped: 0, persisted: 0 },
  }
  const dedupedItemsByUrl = new Map<string, RawItem>()
  for (const item of allItems) {
    const normalizedUrl = item.url.trim()
    const existing = dedupedItemsByUrl.get(normalizedUrl)
    if (!existing) {
      dedupedItemsByUrl.set(normalizedUrl, { ...item, url: normalizedUrl })
      continue
    }

    const mergedTags = Array.from(new Set([...(existing.country_tags ?? []), ...(item.country_tags ?? [])]))
    dedupedItemsByUrl.set(normalizedUrl, {
      ...existing,
      url: normalizedUrl,
      // Prefer richer textual fields when available.
      title: existing.title?.trim() ? existing.title : item.title,
      raw_content:
        (existing.raw_content?.trim()?.length ?? 0) >= (item.raw_content?.trim()?.length ?? 0)
          ? existing.raw_content
          : item.raw_content,
      published_at: existing.published_at ?? item.published_at ?? null,
      country_tags: mergedTags,
      engagement_score: Math.max(existing.engagement_score ?? 0, item.engagement_score ?? 0),
    })
  }
  const uniqueItems = Array.from(dedupedItemsByUrl.values())
  for (const item of uniqueItems) {
    const source = item.source_type
    sourceBreakdown[source] ??= { fetched: 0, deduped: 0, persisted: 0 }
    sourceBreakdown[source].deduped += 1
  }

  let persisted = 0

  if (uniqueItems.length > 0) {
    const ingestedAt = new Date().toISOString()
    const baseRows = uniqueItems.map((item) => ({
      source_type: item.source_type,
      source_name: item.source_name,
      url: item.url,
      title: item.title,
      raw_content: item.raw_content ?? null,
      published_at: item.published_at ?? null,
      ingested_at: ingestedAt,
      country_tags: item.country_tags,
    }))

    const rowsWithEngagement = baseRows.map((row, idx) => ({
      ...row,
      engagement_score: uniqueItems[idx]?.engagement_score ?? 0,
    }))

    let { data, error } = await db
      .from('raw_items')
      .upsert(rowsWithEngagement, { onConflict: 'url', ignoreDuplicates: false })
      .select('id')

    const isMissingEngagementColumn =
      error?.message?.includes("Could not find the 'engagement_score' column") ?? false

    if (isMissingEngagementColumn) {
      console.warn('[Ingest] raw_items.engagement_score missing; retrying upsert without it')
      const retry = await db
        .from('raw_items')
        .upsert(baseRows, { onConflict: 'url', ignoreDuplicates: false })
        .select('id')
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('[Ingest] Upsert failed:', error)
      errors.push(`DB upsert: ${error.message}`)
    } else {
      persisted = data?.length ?? 0
      const persistedRows = await db
        .from('raw_items')
        .select('source_type')
        .eq('ingested_at', ingestedAt)
        .limit(uniqueItems.length)
      if (persistedRows.error) {
        console.warn('[Ingest] Could not compute persisted-by-source breakdown:', persistedRows.error.message)
      } else {
        for (const row of persistedRows.data ?? []) {
          const source = row.source_type ?? 'unknown'
          sourceBreakdown[source] ??= { fetched: 0, deduped: 0, persisted: 0 }
          sourceBreakdown[source].persisted += 1
        }
      }
    }
  }

  return {
    rss: rssItems.length,
    reddit: redditItems.length,
    search: searchItems.length,
    twitter: twitterItems.length,
    youtube: youtubeItems.length,
    total: uniqueItems.length,
    persisted,
    sourceBreakdown,
    errors,
  }
}
