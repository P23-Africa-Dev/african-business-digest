import Parser from 'rss-parser'
import type { RawItem } from '@/lib/types'

interface FeedConfig {
  url: string
  sourceName: string
  defaultCountryTags: string[]
}

const RSS_FEEDS: FeedConfig[] = [
  { url: 'https://techcabal.com/feed/', sourceName: 'TechCabal', defaultCountryTags: ['nigeria'] },
  { url: 'https://disruptafrica.com/feed/', sourceName: 'Disrupt Africa', defaultCountryTags: ['rest_of_africa'] },
  { url: 'https://venturesafrica.com/feed/', sourceName: 'Ventures Africa', defaultCountryTags: ['rest_of_africa'] },
  { url: 'https://businessday.ng/feed/', sourceName: 'BusinessDay Nigeria', defaultCountryTags: ['nigeria'] },
  { url: 'https://www.theafricareport.com/feed/', sourceName: 'The Africa Report', defaultCountryTags: ['rest_of_africa'] },
  { url: 'https://semafor.com/africa/rss', sourceName: 'Semafor Africa', defaultCountryTags: ['rest_of_africa'] },
  { url: 'https://restofworld.org/feed/africa/', sourceName: 'Rest of World Africa', defaultCountryTags: ['rest_of_africa'] },
  { url: 'https://www.itnewsafrica.com/feed/', sourceName: 'IT News Africa', defaultCountryTags: ['south_africa'] },
  { url: 'https://www.bizcommunity.com/rss/196/1.rss', sourceName: 'BizCommunity', defaultCountryTags: ['south_africa'] },
]

const CUTOFF_HOURS = 36

export async function ingestRSS(): Promise<RawItem[]> {
  const parser = new Parser({ timeout: 10000 })
  const cutoff = new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000)
  const seen = new Set<string>()
  const items: RawItem[] = []

  await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url)
        for (const entry of parsed.items ?? []) {
          const url = entry.link?.trim()
          if (!url || seen.has(url)) continue

          const pubDate = entry.pubDate || entry.isoDate
          const publishedAt = pubDate ? new Date(pubDate) : null
          if (publishedAt && publishedAt < cutoff) continue

          seen.add(url)
          items.push({
            source_type: 'news',
            source_name: feed.sourceName,
            url,
            title: entry.title?.trim() ?? '(no title)',
            raw_content: entry.contentSnippet?.trim() || entry.content?.trim() || null,
            published_at: publishedAt?.toISOString() ?? null,
            country_tags: feed.defaultCountryTags,
          })
        }
      } catch (err) {
        console.error(`[RSS] Failed to fetch ${feed.sourceName}:`, err)
      }
    })
  )

  return items
}
