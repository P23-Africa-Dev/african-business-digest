import type { IngestLane, RawItem } from '@/lib/types'
import { canMakeBraveSearch, recordBraveSearchCall } from '@/lib/braveBudget'
import {
  AFRICA_QUERY_CATALOG,
  chunkRotatePool,
  rotatePool,
  type AfricaQuerySpec,
} from './africa-query-catalog'

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
const MAX_TRENDING_BRAVE_QUERIES_PER_RUN = Math.max(
  3,
  Number.parseInt(process.env.MAX_TRENDING_BRAVE_QUERIES_PER_RUN ?? '5', 10) || 5
)
const BRAVE_BUSINESS_CHUNK_COUNT = 4

const BRAVE_SITE_QUERIES: SearchQuery[] = [
  { q: 'site:reddit.com africa business startup', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'site:x.com africa fintech startup', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'site:linkedin.com africa startup funding', countryTags: ['rest_of_africa'], lane: 'business_core' },
  { q: 'site:techcabal.com africa startup analysis', countryTags: ['rest_of_africa'], lane: 'business_core' },
]

function specToBusinessQuery(spec: AfricaQuerySpec): SearchQuery | null {
  if (!spec.braveBusiness) return null
  return { q: spec.braveBusiness, countryTags: spec.countryTags, lane: 'business_core' }
}

function specToTrendingQuery(spec: AfricaQuerySpec): SearchQuery | null {
  if (!spec.braveTrending) return null
  return { q: spec.braveTrending, countryTags: spec.countryTags, lane: 'trending_broad' }
}

const BRAVE_BUSINESS_POOL = [
  ...AFRICA_QUERY_CATALOG.map(specToBusinessQuery).filter((q): q is SearchQuery => q !== null),
  ...BRAVE_SITE_QUERIES,
]
const BRAVE_TRENDING_POOL = AFRICA_QUERY_CATALOG.map(specToTrendingQuery).filter(
  (q): q is SearchQuery => q !== null
)

const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const cache = new Map<string, { data: RawItem[]; expiresAt: number }>()

function businessQueriesThisRun(): SearchQuery[] {
  const selected = chunkRotatePool(BRAVE_BUSINESS_POOL, BRAVE_BUSINESS_CHUNK_COUNT)
  console.log('[Search] Query rotation', { selected: selected.length, total: BRAVE_BUSINESS_POOL.length })
  return selected
}

function trendingQueriesThisRun(): SearchQuery[] {
  if (!ENABLE_TRENDING_BROAD_INGEST) return []
  const out = rotatePool(BRAVE_TRENDING_POOL, MAX_TRENDING_BRAVE_QUERIES_PER_RUN)
  if (out.length > 0) {
    console.log('[Search] Trending broad Brave queries', { enabled: true, count: out.length })
  }
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
