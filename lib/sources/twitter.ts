import type { IngestLane, RawItem } from '@/lib/types'
import {
  AFRICA_QUERY_CATALOG,
  chunkRotatePool,
  rotatePool,
  type AfricaQuerySpec,
} from './africa-query-catalog'

interface TwitterTweet {
  id: string
  text: string
  created_at?: string
  public_metrics?: {
    like_count?: number
    retweet_count?: number
    reply_count?: number
    quote_count?: number
  }
}

interface TwitterSearchResponse {
  data?: TwitterTweet[]
}

interface TwitterQuery {
  q: string
  countryTags: string[]
  lane: IngestLane
}

const ENABLE_TRENDING_BROAD_INGEST = process.env.ENABLE_TRENDING_BROAD_INGEST === 'true'
const MAX_TRENDING_TWITTER_QUERIES_PER_RUN = Math.max(
  2,
  Number.parseInt(process.env.MAX_TRENDING_TWITTER_QUERIES_PER_RUN ?? '4', 10) || 4
)
const TWITTER_BUSINESS_CHUNK_COUNT = 4

function specToBusinessQuery(spec: AfricaQuerySpec): TwitterQuery | null {
  if (!spec.twitterBusiness) return null
  return { q: spec.twitterBusiness, countryTags: spec.countryTags, lane: 'business_core' }
}

function specToTrendingQuery(spec: AfricaQuerySpec): TwitterQuery | null {
  if (!spec.twitterTrending) return null
  return { q: spec.twitterTrending, countryTags: spec.countryTags, lane: 'trending_broad' }
}

const TWITTER_BUSINESS_POOL = AFRICA_QUERY_CATALOG.map(specToBusinessQuery).filter(
  (q): q is TwitterQuery => q !== null
)
const TWITTER_TRENDING_POOL = AFRICA_QUERY_CATALOG.map(specToTrendingQuery).filter(
  (q): q is TwitterQuery => q !== null
)

function businessQueriesThisRun(): TwitterQuery[] {
  return chunkRotatePool(TWITTER_BUSINESS_POOL, TWITTER_BUSINESS_CHUNK_COUNT)
}

function trendingQueriesThisRun(): TwitterQuery[] {
  if (!ENABLE_TRENDING_BROAD_INGEST) return []
  const out = rotatePool(TWITTER_TRENDING_POOL, MAX_TRENDING_TWITTER_QUERIES_PER_RUN)
  if (out.length > 0) {
    console.log('[Twitter] Trending lane queries this run', { count: out.length })
  }
  return out
}

function queriesForThisRun(): TwitterQuery[] {
  return [...businessQueriesThisRun(), ...trendingQueriesThisRun()]
}

async function searchTweets(query: string, bearerToken: string): Promise<TwitterTweet[]> {
  const url = new URL('https://api.twitter.com/2/tweets/search/recent')
  url.searchParams.set('query', query)
  url.searchParams.set('max_results', '25')
  url.searchParams.set('tweet.fields', 'created_at,public_metrics')

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  })
  if (!res.ok) throw new Error(`Twitter API HTTP ${res.status}`)
  const json = (await res.json()) as TwitterSearchResponse
  return json.data ?? []
}

function tweetEngagementScore(tweet: TwitterTweet): number {
  const m = tweet.public_metrics
  if (!m) return 0
  return (m.like_count ?? 0) + (m.retweet_count ?? 0) * 2 + (m.reply_count ?? 0) + (m.quote_count ?? 0)
}

export async function ingestTwitter(): Promise<RawItem[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) {
    console.info('[Twitter] Skipping ingestion: missing TWITTER_BEARER_TOKEN')
    return []
  }

  const seen = new Set<string>()
  const items: RawItem[] = []
  for (const query of queriesForThisRun()) {
    try {
      const tweets = await searchTweets(query.q, bearerToken)
      for (const tweet of tweets) {
        const url = `https://x.com/i/web/status/${tweet.id}`
        if (seen.has(url)) continue
        seen.add(url)
        items.push({
          source_type: 'twitter',
          source_name: 'x.com',
          url,
          title: tweet.text.slice(0, 280),
          raw_content: tweet.text,
          published_at: tweet.created_at ?? null,
          country_tags: query.countryTags,
          engagement_score: tweetEngagementScore(tweet),
          ingest_lane: query.lane,
        })
      }
    } catch (err) {
      console.error(`[Twitter] Query failed "${query.q}":`, err)
    }
  }
  return items
}
