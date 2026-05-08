import type { RawItem } from '@/lib/types'

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
}

const YOUTUBE_QUERIES: YoutubeQuery[] = [
  { q: 'africa startup funding', countryTags: ['rest_of_africa'] },
  { q: 'nigeria fintech business analysis', countryTags: ['nigeria'] },
  { q: 'kenya startup ecosystem business', countryTags: ['kenya'] },
  { q: 'south africa business economy analysis', countryTags: ['south_africa'] },
  { q: 'africa logistics supply chain business', countryTags: ['rest_of_africa'] },
  { q: 'africa energy investment business', countryTags: ['rest_of_africa'] },
]

function queriesForThisRun(): YoutubeQuery[] {
  const chunk = Math.floor(Date.now() / (6 * 60 * 60 * 1000)) % 2
  return YOUTUBE_QUERIES.filter((_, i) => i % 2 === chunk)
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
        })
      }
    } catch (err) {
      console.error(`[YouTube] Query failed "${q.q}":`, err)
    }
  }

  return items
}
