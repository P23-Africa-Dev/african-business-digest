import { createServerClient } from '@/lib/db/client'
import { ingestRSS } from './rss'
import { ingestReddit } from './reddit'
import { ingestSearch } from './search'
import { ingestTwitter } from './twitter'
import type { RawItem } from '@/lib/types'

export interface IngestResult {
  rss: number
  reddit: number
  search: number
  twitter: number
  total: number
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

  const [rssResult, redditResult, searchResult, twitterResult] = await Promise.allSettled([
    ingestRSS(),
    redditTask,
    ingestSearch(),
    ingestTwitter(),
  ])

  const rssItems = rssResult.status === 'fulfilled' ? rssResult.value : []
  const redditItems = redditResult.status === 'fulfilled' ? redditResult.value : []
  const searchItems = searchResult.status === 'fulfilled' ? searchResult.value : []
  const twitterItems = twitterResult.status === 'fulfilled' ? twitterResult.value : []

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

  const allItems: RawItem[] = [...rssItems, ...redditItems, ...searchItems, ...twitterItems]

  if (allItems.length > 0) {
    const { error } = await db.from('raw_items').upsert(
      allItems.map((item) => ({
        source_type: item.source_type,
        source_name: item.source_name,
        url: item.url,
        title: item.title,
        raw_content: item.raw_content ?? null,
        published_at: item.published_at ?? null,
        ingested_at: new Date().toISOString(),
        country_tags: item.country_tags,
        engagement_score: item.engagement_score ?? 0,
      })),
      { onConflict: 'url', ignoreDuplicates: false }
    )

    if (error) {
      console.error('[Ingest] Upsert failed:', error)
      errors.push(`DB upsert: ${error.message}`)
    }
  }

  return {
    rss: rssItems.length,
    reddit: redditItems.length,
    search: searchItems.length,
    twitter: twitterItems.length,
    total: allItems.length,
    errors,
  }
}
