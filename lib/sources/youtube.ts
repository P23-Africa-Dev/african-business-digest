import type { IngestLane, RawItem } from '@/lib/types'

interface YoutubeSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    description?: string
    channelTitle?: string
    publishedAt?: string
  }
}

interface YoutubeQuery {
  q: string
  countryTags: string[]
  lane: IngestLane
}

const ENABLE_TRENDING_BROAD_INGEST = process.env.ENABLE_TRENDING_BROAD_INGEST === 'true'
const MAX_TRENDING_YOUTUBE_QUERIES_PER_RUN = 2

const YOUTUBE_BUSINESS_QUERIES: YoutubeQuery[] = [
  { q: 'africa startup funding', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'nigeria fintech business analysis', countryTags: ['nigeria'], lane: 'business_core' },
  { q: 'kenya startup ecosystem business', countryTags: ['kenya'], lane: 'business_core' },
  { q: 'south africa business economy analysis', countryTags: ['south_africa'], lane: 'business_core' },
  { q: 'africa logistics supply chain business', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'africa energy investment business', countryTags: ['rest_of_africa'], lane: 'business_core' },
]

const YOUTUBE_TRENDING_QUERIES: YoutubeQuery[] = [
  { q: 'nigeria news economy election', countryTags: ['nigeria'], lane: 'trending_broad' },
  { q: 'kenya news politics economy', countryTags: ['kenya'], lane: 'trending_broad' },
  { q: 'south africa news economy today', countryTags: ['south_africa'], lane: 'trending_broad' },
  { q: 'egypt news economy', countryTags: ['egypt'], lane: 'trending_broad' },
  { q: 'ghana news economy cedi', countryTags: ['ghana'], lane: 'trending_broad' },
  { q: 'africa breaking news economy', countryTags: ['rest_of_africa'], lane: 'trending_broad' },
]

function businessQueriesThisRun(): YoutubeQuery[] {
  const chunk = Math.floor(Date.now() / (6 * 60 * 60 * 1000)) % 2
  return YOUTUBE_BUSINESS_QUERIES.filter((_, i) => i % 2 === chunk)
}

function trendingQueriesThisRun(): YoutubeQuery[] {
  if (!ENABLE_TRENDING_BROAD_INGEST) return []
  const pool = YOUTUBE_TRENDING_QUERIES
  if (pool.length === 0) return []
  const windowStart = Math.floor(Date.now() / (6 * 60 * 60 * 1000))
  const start = windowStart % pool.length
  const n = Math.min(MAX_TRENDING_YOUTUBE_QUERIES_PER_RUN, pool.length)
  const out: YoutubeQuery[] = []
  for (let i = 0; i < n; i++) {
    out.push(pool[(start + i) % pool.length]!)
  }
  if (out.length > 0) {
    console.log('[YouTube] Trending lane queries this run', { count: out.length, startIndex: start })
  }
  return out
}

function queriesForThisRun(): YoutubeQuery[] {
  return [...businessQueriesThisRun(), ...trendingQueriesThisRun()]
}

async function searchYoutube(query: string): Promise<YoutubeSearchItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', '10')
  url.searchParams.set('type', 'video')
  url.searchParams.set('order', 'date')
  url.searchParams.set('publishedAfter', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`)
  const json = await res.json()
  return (json.items ?? []) as YoutubeSearchItem[]
}

export async function ingestYoutube(): Promise<RawItem[]> {
  if (!process.env.YOUTUBE_API_KEY) return []

  const seen = new Set<string>()
  const items: RawItem[] = []
  const queries = queriesForThisRun()

  for (const q of queries) {
    try {
      const results = await searchYoutube(q.q)
      for (const item of results) {
        const videoId = item.id?.videoId
        if (!videoId) continue
        const url = `https://www.youtube.com/watch?v=${videoId}`
        if (seen.has(url)) continue
        seen.add(url)
        items.push({
          source_type: 'youtube',
          source_name: item.snippet?.channelTitle ?? 'YouTube',
          url,
          title: item.snippet?.title ?? 'YouTube video',
          raw_content: item.snippet?.description ?? null,
          published_at: item.snippet?.publishedAt ?? null,
          country_tags: q.countryTags,
          engagement_score: 0,
          ingest_lane: q.lane,
        })
      }
    } catch (err) {
      console.error(`[YouTube] Query failed "${q.q}":`, err)
    }
  }

  return items
}
