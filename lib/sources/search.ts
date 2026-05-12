import type { IngestLane, RawItem } from '@/lib/types'
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
  lane: IngestLane
}

const ENABLE_TRENDING_BROAD_INGEST = process.env.ENABLE_TRENDING_BROAD_INGEST === 'true'
const MAX_TRENDING_BRAVE_QUERIES_PER_RUN = 3

const BUSINESS_CORE_QUERIES: SearchQuery[] = [
  { q: '"African fintech" funding discussion OR analysis', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: '"Nigerian startup" funding analysis OR commentary', countryTags: ['nigeria'], lane: 'business_core' },
  { q: '"Kenya tech" investment discussion OR forum', countryTags: ['kenya'], lane: 'business_core' },
  { q: '"South Africa" business analysis startup ecosystem', countryTags: ['south_africa'], lane: 'business_core' },
  { q: '"Egyptian startup" funding analysis OR policy', countryTags: ['egypt'], lane: 'business_core' },
  { q: '"Ghana business" startup discussion OR economy analysis', countryTags: ['ghana'], lane: 'business_core' },
  { q: '"Morocco" startup fintech discussion OR analysis', countryTags: ['morocco'], lane: 'business_core' },
  { q: 'African logistics supply chain analysis discussion', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'African energy renewable investment commentary', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'Africa deals funding acquisition analysis', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'Ethiopia business startup discussion analysis', countryTags: ['ethiopia'], lane: 'business_core' },
  { q: 'Tanzania business investment analysis discussion', countryTags: ['tanzania'], lane: 'business_core' },
  { q: 'Uganda startup fintech discussion analysis', countryTags: ['uganda'], lane: 'business_core' },
  { q: 'Senegal business economy startup analysis', countryTags: ['senegal'], lane: 'business_core' },
  { q: 'site:reddit.com africa business startup', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'site:x.com africa fintech startup', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'site:linkedin.com africa startup funding', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'site:techcabal.com africa startup analysis', countryTags: ['rest_of_africa'], lane: 'business_core' },
]

/** Brave-only lane B: geography-scoped “what people are talking about” (not global celebrity churn). */
const TRENDING_BROAD_QUERIES: SearchQuery[] = [
  { q: 'Africa election OR parliament OR government news', countryTags: ['rest_of_africa'], lane: 'trending_broad' },
  { q: 'Nigeria economy OR naira OR CBN OR inflation news', countryTags: ['nigeria'], lane: 'trending_broad' },
  { q: 'Kenya politics OR economy OR infrastructure news', countryTags: ['kenya'], lane: 'trending_broad' },
  { q: 'South Africa economy OR Eskom OR Rand currency news', countryTags: ['south_africa'], lane: 'trending_broad' },
  { q: 'Egypt economy OR currency OR Suez infrastructure news', countryTags: ['egypt'], lane: 'trending_broad' },
  { q: 'Ghana economy OR cedi OR election news', countryTags: ['ghana'], lane: 'trending_broad' },
  { q: 'Ethiopia OR Tanzania OR Uganda breaking news economy', countryTags: ['rest_of_africa'], lane: 'trending_broad' },
]

const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const cache = new Map<string, { data: RawItem[]; expiresAt: number }>()

function businessQueriesThisRun(): SearchQuery[] {
  const chunk = Math.floor(Date.now() / (4 * 60 * 60 * 1000)) % 3
  const selected = BUSINESS_CORE_QUERIES.filter((_, i) => i % 3 === chunk)
  console.log('[Search] Query rotation', { chunk, selected: selected.length, total: BUSINESS_CORE_QUERIES.length })
  return selected
}

function trendingQueriesThisRun(): SearchQuery[] {
  if (!ENABLE_TRENDING_BROAD_INGEST) return []
  const pool = TRENDING_BROAD_QUERIES
  if (pool.length === 0) return []
  const windowStart = Math.floor(Date.now() / (4 * 60 * 60 * 1000))
  const start = windowStart % pool.length
  const n = Math.min(MAX_TRENDING_BRAVE_QUERIES_PER_RUN, pool.length)
  const out: SearchQuery[] = []
  for (let i = 0; i < n; i++) {
    out.push(pool[(start + i) % pool.length]!)
  }
  console.log('[Search] Trending broad Brave queries', { enabled: true, count: out.length, startIndex: start })
  return out
}

function queriesForThisRun(): SearchQuery[] {
  return [...businessQueriesThisRun(), ...trendingQueriesThisRun()]
}

function cacheKey(sq: SearchQuery): string {
  return `${sq.lane}::${sq.q}`
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
    const key = cacheKey(sq)
    const cached = cache.get(key)
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
        ingest_lane: sq.lane,
      }))

      cache.set(key, { data: items, expiresAt: now + CACHE_TTL_MS })

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
