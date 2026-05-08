import type { RawItem } from '@/lib/types'

interface TwitterTweet {
  id: string
  text: string
  created_at?: string
}

interface TwitterSearchResponse {
  data?: TwitterTweet[]
}

const TWITTER_QUERIES = [
  { q: '(africa startup funding OR fintech) -is:retweet lang:en', countryTags: ['rest_of_africa'] },
  { q: '(nigeria startup OR nigeria fintech) -is:retweet lang:en', countryTags: ['nigeria'] },
  { q: '(kenya startup OR kenya fintech) -is:retweet lang:en', countryTags: ['kenya'] },
  { q: '(south africa business economy) -is:retweet lang:en', countryTags: ['south_africa'] },
]

function queriesForThisRun() {
  const chunk = Math.floor(Date.now() / (4 * 60 * 60 * 1000)) % 2
  return TWITTER_QUERIES.filter((_, i) => i % 2 === chunk)
}

async function searchTweets(query: string, bearerToken: string): Promise<TwitterTweet[]> {
  const url = new URL('https://api.twitter.com/2/tweets/search/recent')
  url.searchParams.set('query', query)
  url.searchParams.set('max_results', '25')
  url.searchParams.set('tweet.fields', 'created_at')

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  })
  if (!res.ok) throw new Error(`Twitter API HTTP ${res.status}`)
  const json = (await res.json()) as TwitterSearchResponse
  return json.data ?? []
}

export async function ingestTwitter(): Promise<RawItem[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) return []

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
          engagement_score: 0,
        })
      }
    } catch (err) {
      console.error(`[Twitter] Query failed "${query.q}":`, err)
    }
  }
  return items
}
