import type { RawItem } from '@/lib/types'
import { canMakeBraveSearch, recordBraveSearchCall } from '@/lib/braveBudget'

interface BraveResult {
  title: string
  url: string
  description: string
  page_age?: string
  meta_url?: { netloc: string }
}

interface SearchQuery {
  q: string
  countryTags: string[]
}

const SEARCH_QUERIES: SearchQuery[] = [
  { q: '"African fintech" funding discussion OR analysis', countryTags: ['rest_of_africa'] },
  { q: '"Nigerian startup" funding analysis OR commentary', countryTags: ['nigeria'] },
  { q: '"Kenya tech" investment discussion OR forum', countryTags: ['kenya'] },
  { q: '"South Africa" business analysis startup ecosystem', countryTags: ['south_africa'] },
  { q: '"Egyptian startup" funding analysis OR policy', countryTags: ['egypt'] },
  { q: '"Ghana business" startup discussion OR economy analysis', countryTags: ['ghana'] },
  { q: '"Morocco" startup fintech discussion OR analysis', countryTags: ['morocco'] },
  { q: 'African logistics supply chain analysis discussion', countryTags: ['rest_of_africa'] },
  { q: 'African energy renewable investment commentary', countryTags: ['rest_of_africa'] },
  { q: 'Africa deals funding acquisition analysis', countryTags: ['rest_of_africa'] },
  { q: 'Ethiopia business startup discussion analysis', countryTags: ['ethiopia'] },
  { q: 'Tanzania business investment analysis discussion', countryTags: ['tanzania'] },
  { q: 'Uganda startup fintech discussion analysis', countryTags: ['uganda'] },
  { q: 'Senegal business economy startup analysis', countryTags: ['senegal'] },
  { q: 'site:reddit.com africa business startup', countryTags: ['rest_of_africa'] },
  { q: 'site:x.com africa fintech startup', countryTags: ['rest_of_africa'] },
  { q: 'site:linkedin.com africa startup funding', countryTags: ['rest_of_africa'] },
  { q: 'site:techcabal.com africa startup analysis', countryTags: ['rest_of_africa'] },
]

const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const cache = new Map<string, { data: RawItem[]; expiresAt: number }>()

function queriesForThisRun(): SearchQuery[] {
  const chunk = Math.floor(Date.now() / (4 * 60 * 60 * 1000)) % 3
  const selected = SEARCH_QUERIES.filter((_, i) => i % 3 === chunk)
  console.log('[Search] Query rotation', { chunk, selected: selected.length, total: SEARCH_QUERIES.length })
  return selected
}

async function braveSearch(query: string): Promise<BraveResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '10')
  url.searchParams.set('freshness', 'pd') // past day

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY!,
    },
  })

  if (!res.ok) throw new Error(`Brave Search HTTP ${res.status}`)
  const json = await res.json()
  return (json.web?.results ?? []) as BraveResult[]
}

export async function ingestSearch(): Promise<RawItem[]> {
  const now = Date.now()
  const allItems: RawItem[] = []
  const seen = new Set<string>()
  const queriesThisRun = queriesForThisRun()

  for (const sq of queriesThisRun) {
    const cached = cache.get(sq.q)
    if (cached && cached.expiresAt > now) {
      for (const item of cached.data) {
        if (!seen.has(item.url)) {
          seen.add(item.url)
          allItems.push(item)
        }
      }
      continue
    }

    const braveGate = await canMakeBraveSearch()
    if (!braveGate.allowed) {
      console.warn(
        `[Search] Monthly Brave API cap reached (${braveGate.usedThisMonth}), skipping remaining queries`
      )
      break
    }

    try {
      const results = await braveSearch(sq.q)
      await recordBraveSearchCall(sq.q, true)
      const items: RawItem[] = results.map((r) => ({
        source_type: 'search' as const,
        source_name: r.meta_url?.netloc ?? new URL(r.url).hostname,
        url: r.url,
        title: r.title,
        raw_content: r.description ?? null,
        published_at: r.page_age ? new Date(r.page_age).toISOString() : null,
        country_tags: sq.countryTags,
        engagement_score: 0,
      }))

      cache.set(sq.q, { data: items, expiresAt: now + CACHE_TTL_MS })

      for (const item of items) {
        if (!seen.has(item.url)) {
          seen.add(item.url)
          allItems.push(item)
        }
      }
    } catch (err) {
      await recordBraveSearchCall(sq.q, false)
      console.error(`[Search] Query failed "${sq.q}":`, err)
    }
  }

  return allItems
}
