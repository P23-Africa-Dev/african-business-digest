import type { IngestLane, RawItem } from '@/lib/types'

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
const MAX_TRENDING_TWITTER_QUERIES_PER_RUN = 2

const TWITTER_BUSINESS_QUERIES: TwitterQuery[] = [
  { q: '(africa startup funding OR fintech) -is:retweet lang:en', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: '(nigeria startup OR nigeria fintech) -is:retweet lang:en', countryTags: ['nigeria'], lane: 'business_core' },
  { q: '(kenya startup OR kenya fintech) -is:retweet lang:en', countryTags: ['kenya'], lane: 'business_core' },
  { q: '(south africa business economy) -is:retweet lang:en', countryTags: ['south_africa'], lane: 'business_core' },
]

/** Lane B: civic / economy / policy signal (same env gate as Brave trending). */
const TWITTER_TRENDING_QUERIES: TwitterQuery[] = [
  {
    q: '(nigeria economy OR naira OR CBN OR election) -is:retweet lang:en',
    countryTags: ['nigeria'],
    lane: 'trending_broad',
  },
  {
    q: '(kenya politics OR economy OR infrastructure) -is:retweet lang:en',
    countryTags: ['kenya'],
    lane: 'trending_broad',
  },
  {
    q: '(south africa economy OR rand OR Eskom OR election) -is:retweet lang:en',
    countryTags: ['south_africa'],
    lane: 'trending_broad',
  },
  {
    q: '(egypt economy OR currency OR inflation) -is:retweet lang:en',
    countryTags: ['egypt'],
    lane: 'trending_broad',
  },
  {
    q: '(ghana economy OR cedi OR election) -is:retweet lang:en',
    countryTags: ['ghana'],
    lane: 'trending_broad',
  },
]

function businessQueriesThisRun(): TwitterQuery[] {
  const chunk = Math.floor(Date.now() / (4 * 60 * 60 * 1000)) % 2
  return TWITTER_BUSINESS_QUERIES.filter((_, i) => i % 2 === chunk)
}

function trendingQueriesThisRun(): TwitterQuery[] {
  if (!ENABLE_TRENDING_BROAD_INGEST) return []
  const pool = TWITTER_TRENDING_QUERIES
  if (pool.length === 0) return []
  const windowStart = Math.floor(Date.now() / (4 * 60 * 60 * 1000))
  const start = windowStart % pool.length
  const n = Math.min(MAX_TRENDING_TWITTER_QUERIES_PER_RUN, pool.length)
  const out: TwitterQuery[] = []
  for (let i = 0; i < n; i++) {
    out.push(pool[(start + i) % pool.length]!)
  }
  if (out.length > 0) {
    console.log('[Twitter] Trending lane queries this run', { count: out.length, startIndex: start })
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
