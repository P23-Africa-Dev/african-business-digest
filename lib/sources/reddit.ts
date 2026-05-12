import type { IngestLane, RawItem } from '@/lib/types'

interface SubredditConfig {
  name: string
  countryTags: string[]
  /** If set, title/selftext must match at least one keyword. Omit for no filter. */
  keywords?: string[]
  ingest_lane: IngestLane
}

const SUBREDDITS: SubredditConfig[] = [
  { name: 'Africa', countryTags: ['rest_of_africa'], ingest_lane: 'business_core' },
  {
    name: 'Nigeria',
    countryTags: ['nigeria'],
    keywords: ['business', 'startup', 'fintech', 'economy'],
    ingest_lane: 'business_core',
  },
  {
    name: 'Kenya',
    countryTags: ['kenya'],
    keywords: ['business', 'startup', 'tech'],
    ingest_lane: 'business_core',
  },
  {
    name: 'southafrica',
    countryTags: ['south_africa'],
    keywords: ['business', 'economy', 'startup'],
    ingest_lane: 'business_core',
  },
  {
    name: 'Egypt',
    countryTags: ['egypt'],
    keywords: ['business', 'economy'],
    ingest_lane: 'business_core',
  },
  {
    name: 'ghana',
    countryTags: ['ghana'],
    keywords: ['business', 'economy'],
    ingest_lane: 'business_core',
  },
  {
    name: 'business',
    countryTags: ['rest_of_africa'],
    keywords: ['africa', 'african', 'nigeria', 'kenya'],
    ingest_lane: 'business_core',
  },
  {
    name: 'Entrepreneur',
    countryTags: ['rest_of_africa'],
    keywords: ['africa', 'african'],
    ingest_lane: 'business_core',
  },
]

/** Lane B: same country subs with a permissive but non-empty keyword allowlist (avoids sports/drama flood). */
const TRENDING_SUBREDDITS: SubredditConfig[] = [
  {
    name: 'Nigeria',
    countryTags: ['nigeria'],
    keywords: [
      'election',
      'economy',
      'currency',
      'naira',
      'cbn',
      'government',
      'president',
      'protest',
      'policy',
      'infrastructure',
      'fuel',
      'subsidy',
      'parliament',
    ],
    ingest_lane: 'trending_broad',
  },
  {
    name: 'Kenya',
    countryTags: ['kenya'],
    keywords: [
      'election',
      'economy',
      'currency',
      'government',
      'president',
      'protest',
      'policy',
      'infrastructure',
      'parliament',
    ],
    ingest_lane: 'trending_broad',
  },
  {
    name: 'southafrica',
    countryTags: ['south_africa'],
    keywords: [
      'election',
      'economy',
      'rand',
      'government',
      'president',
      'protest',
      'policy',
      'infrastructure',
      'eskom',
      'parliament',
    ],
    ingest_lane: 'trending_broad',
  },
]

const ALL_SUBREDDITS = [...SUBREDDITS, ...TRENDING_SUBREDDITS]

interface RedditPost {
  data: {
    id: string
    title: string
    selftext: string
    url: string
    permalink: string
    score: number
    num_comments: number
    created_utc: number
    subreddit: string
  }
}

async function getRedditToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'AfricanBusinessDigest/1.0',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`)
  const json = await res.json()
  return json.access_token as string
}

function computeEngagementScore(score: number, numComments: number): number {
  // Blend of upvotes (70%) and comments (30%), normalized to 0-100
  const normalizedScore = Math.min(score / 1000, 1) * 70
  const normalizedComments = Math.min(numComments / 200, 1) * 30
  return Math.round(normalizedScore + normalizedComments)
}

export async function ingestReddit(): Promise<RawItem[]> {
  let token: string
  try {
    token = await getRedditToken()
  } catch (err) {
    console.error('[Reddit] Auth failed:', err)
    return []
  }

  const cutoff = Date.now() / 1000 - 24 * 60 * 60
  const userAgent = process.env.REDDIT_USER_AGENT || 'AfricanBusinessDigest/1.0'
  const seen = new Set<string>()
  const items: RawItem[] = []

  await Promise.allSettled(
    ALL_SUBREDDITS.map(async (sub) => {
      try {
        const res = await fetch(`https://oauth.reddit.com/r/${sub.name}/hot?limit=50&t=day`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': userAgent,
          },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const posts: RedditPost[] = json.data?.children ?? []

        for (const post of posts) {
          const d = post.data
          if (d.created_utc < cutoff) continue

          const url = `https://reddit.com${d.permalink}`
          if (seen.has(url)) continue

          if (sub.keywords && sub.keywords.length > 0) {
            const text = (d.title + ' ' + d.selftext).toLowerCase()
            const matches = sub.keywords.some((kw) => text.includes(kw.toLowerCase()))
            if (!matches) continue
          }

          seen.add(url)
          const engagementScore = computeEngagementScore(d.score, d.num_comments)
          items.push({
            source_type: 'reddit',
            source_name: `r/${d.subreddit}`,
            url,
            title: d.title,
            raw_content: d.selftext?.slice(0, 2000) || null,
            published_at: new Date(d.created_utc * 1000).toISOString(),
            country_tags: sub.countryTags,
            engagement_score: engagementScore,
            ingest_lane: sub.ingest_lane,
          })
        }
      } catch (err) {
        console.error(`[Reddit] Failed r/${sub.name}:`, err)
      }
    })
  )

  return items
}
