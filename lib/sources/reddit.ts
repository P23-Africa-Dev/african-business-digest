import type { RawItem } from '@/lib/types'

interface SubredditConfig {
  name: string
  countryTags: string[]
  keywords?: string[]
}

const SUBREDDITS: SubredditConfig[] = [
  { name: 'Africa', countryTags: ['rest_of_africa'] },
  { name: 'Nigeria', countryTags: ['nigeria'], keywords: ['business', 'startup', 'fintech', 'economy'] },
  { name: 'Kenya', countryTags: ['kenya'], keywords: ['business', 'startup', 'tech'] },
  { name: 'southafrica', countryTags: ['south_africa'], keywords: ['business', 'economy', 'startup'] },
  { name: 'Egypt', countryTags: ['egypt'], keywords: ['business', 'economy'] },
  { name: 'ghana', countryTags: ['ghana'], keywords: ['business', 'economy'] },
  { name: 'business', countryTags: ['rest_of_africa'], keywords: ['africa', 'african', 'nigeria', 'kenya'] },
  { name: 'Entrepreneur', countryTags: ['rest_of_africa'], keywords: ['africa', 'african'] },
]

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
    SUBREDDITS.map(async (sub) => {
      try {
        const res = await fetch(
          `https://oauth.reddit.com/r/${sub.name}/hot?limit=50&t=day`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': userAgent,
            },
          }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const posts: RedditPost[] = json.data?.children ?? []

        for (const post of posts) {
          const d = post.data
          if (d.created_utc < cutoff) continue

          const url = `https://reddit.com${d.permalink}`
          if (seen.has(url)) continue

          // For subreddits with keyword filters, only include matching posts
          if (sub.keywords) {
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
          })
        }
      } catch (err) {
        console.error(`[Reddit] Failed r/${sub.name}:`, err)
      }
    })
  )

  return items
}
