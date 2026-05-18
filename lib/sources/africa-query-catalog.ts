import type { IngestLane } from '@/lib/types'
import { EXTENDED_AFRICAN_COUNTRIES, PRIMARY_COUNTRY_SLUGS } from '@/lib/regions'

export type QueryIntent = 'business_story' | 'trending_news' | 'business_discussion' | 'trending_discussion'

export type AfricaQuerySpec = {
  countryTags: string[]
  lane: IngestLane
  intent: QueryIntent
  /** Primary geography label for Brave query templates */
  geoLabel: string
  braveBusiness?: string
  braveTrending?: string
  twitterBusiness?: string
  twitterTrending?: string
}

const PRIMARY_GEO: Record<string, string> = {
  nigeria: 'Nigeria',
  kenya: 'Kenya',
  south_africa: 'South Africa',
  egypt: 'Egypt',
  ghana: 'Ghana',
  morocco: 'Morocco',
  rest_of_africa: 'Africa',
}

function specForCountry(slug: string, geoLabel: string): AfricaQuerySpec {
  const tags = [slug]
  const g = geoLabel
  const isPan = slug === 'rest_of_africa'
  return {
    countryTags: tags,
    lane: 'business_core',
    intent: 'business_story',
    geoLabel: g,
    braveBusiness: isPan
      ? '"African" startup OR fintech OR business news analysis'
      : `"${g}" startup OR fintech OR business news analysis`,
    braveTrending: isPan
      ? 'Africa breaking news economy politics today'
      : `${g} breaking news economy politics election today`,
    twitterBusiness: isPan
      ? '(Africa OR African) (startup OR fintech OR funding OR business) -is:retweet lang:en'
      : `(${g} OR #${slug.replace(/_/g, '')}) (startup OR fintech OR business OR economy) -is:retweet lang:en`,
    twitterTrending: isPan
      ? '(Africa OR African) (breaking OR trending) (economy OR election OR protest) -is:retweet lang:en'
      : `(${g}) (breaking OR trending OR election OR economy OR inflation) -is:retweet lang:en`,
  }
}

const PRIMARY_SPECS: AfricaQuerySpec[] = PRIMARY_COUNTRY_SLUGS.map((slug) =>
  specForCountry(slug, PRIMARY_GEO[slug] ?? slug)
)

const EXTENDED_SPECS: AfricaQuerySpec[] = EXTENDED_AFRICAN_COUNTRIES.map((c) =>
  specForCountry(c.slug, c.label)
)

/** Pan-Africa + primary markets + extended markets for ingest rotation. */
export const AFRICA_QUERY_CATALOG: AfricaQuerySpec[] = [...PRIMARY_SPECS, ...EXTENDED_SPECS]

export function catalogForLane(lane: IngestLane): AfricaQuerySpec[] {
  return AFRICA_QUERY_CATALOG.filter((s) => s.lane === lane || lane === 'trending_broad')
}

export function rotatePool<T>(pool: T[], maxPerRun: number, windowHours = 4): T[] {
  if (pool.length === 0 || maxPerRun <= 0) return []
  const windowStart = Math.floor(Date.now() / (windowHours * 60 * 60 * 1000))
  const start = windowStart % pool.length
  const n = Math.min(maxPerRun, pool.length)
  const out: T[] = []
  for (let i = 0; i < n; i++) out.push(pool[(start + i) % pool.length]!)
  return out
}

export function chunkRotatePool<T>(pool: T[], chunkCount: number, windowHours = 4): T[] {
  if (pool.length === 0 || chunkCount <= 0) return []
  const chunk = Math.floor(Date.now() / (windowHours * 60 * 60 * 1000)) % chunkCount
  return pool.filter((_, i) => i % chunkCount === chunk)
}
