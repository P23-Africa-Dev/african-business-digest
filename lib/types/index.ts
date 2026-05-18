export type SourceType = 'news' | 'reddit' | 'search' | 'twitter' | 'youtube'
export type StoryStatus = 'new' | 'developing' | 'fading'
export type SavedItemType = 'story' | 'discussion'
export type IngestLane = 'business_core' | 'trending_broad'

export type Category =
  | 'fintech'
  | 'logistics'
  | 'energy'
  | 'retail'
  | 'deals_funding'
  | 'policy'
  | 'business_failures'
  | 'agriculture'
  | 'infrastructure'
  | 'consumer_markets'
  | 'society'
  | 'trending'

export const CATEGORIES_PRIMARY: Category[] = [
  'fintech',
  'logistics',
  'energy',
  'retail',
  'deals_funding',
  'policy',
  'business_failures',
]
export const CATEGORIES_EXTRA: Category[] = [
  'agriculture',
  'infrastructure',
  'consumer_markets',
  'society',
  'trending',
]
export const CATEGORIES: Category[] = [...CATEGORIES_PRIMARY, ...CATEGORIES_EXTRA]

export const CATEGORY_LABELS: Record<Category, string> = {
  fintech: 'Fintech',
  logistics: 'Logistics',
  energy: 'Energy',
  retail: 'Retail',
  deals_funding: 'Deals & Funding',
  policy: 'Policy',
  business_failures: 'Business Failures',
  agriculture: 'Agriculture',
  infrastructure: 'Infrastructure',
  consumer_markets: 'Consumer & Markets',
  society: 'Society',
  trending: 'Trending',
}

export const COUNTRIES = [
  'nigeria',
  'kenya',
  'south_africa',
  'egypt',
  'ghana',
  'morocco',
  'rest_of_africa',
] as const
export type Country = (typeof COUNTRIES)[number]

export const COUNTRY_LABELS: Record<Country, string> = {
  nigeria: 'Nigeria',
  kenya: 'Kenya',
  south_africa: 'South Africa',
  egypt: 'Egypt',
  ghana: 'Ghana',
  morocco: 'Morocco',
  rest_of_africa: 'Rest of Africa',
}

export const COUNTRY_FLAGS: Record<Country, string> = {
  nigeria: '🇳🇬',
  kenya: '🇰🇪',
  south_africa: '🇿🇦',
  egypt: '🇪🇬',
  ghana: '🇬🇭',
  morocco: '🇲🇦',
  rest_of_africa: '🌍',
}

export interface RawItem {
  id?: string
  source_type: SourceType
  source_name: string
  url: string
  title: string
  raw_content?: string | null
  published_at?: string | null
  ingested_at?: string
  country_tags: string[]
  engagement_score?: number
  /** Defaults to business_core when omitted (legacy rows / callers). */
  ingest_lane?: IngestLane
}

export interface Story {
  id: string
  headline: string
  summary: string
  category: Category
  country_tags: string[]
  relevance_score: number
  status: StoryStatus
  first_seen_at: string
  last_updated_at: string
  /** Defaults to business_core when omitted (legacy rows). */
  ingest_lane?: IngestLane
  sources?: StorySource[]
}

export interface StorySource {
  id: string
  story_id: string
  raw_item_id: string
  is_primary: boolean
  raw_item?: RawItem
}

export interface Discussion {
  id: string
  platform: string
  url: string
  title: string
  excerpt?: string | null
  engagement_score: number
  country_tags: string[]
  category?: Category | null
  posted_at?: string | null
  ingested_at: string
  /** Populated after migration 008; infer from URL when null. */
  source_type?: SourceType | null
}

export interface DigestData {
  stories: Story[]
  discussions: Discussion[]
  lastUpdated: string | null
  storyCount: number
  effectiveMinRelevance?: number
  fallbackTier?: number
  usedCountryFallback?: boolean
  storyAttempts?: Array<{
    minRelevance: number
    usedCountryFallback: boolean
    count: number
  }>
}

export interface SavedItem {
  id: string
  item_type: SavedItemType
  story_id?: string | null
  discussion_id?: string | null
  title_snapshot: string
  url_snapshot: string | null
  category_snapshot?: Category | null
  country_tags_snapshot: string[]
  created_at: string
}

export interface SaveItemPayload {
  itemType: SavedItemType
  itemId: string
}

export interface SavedFilters {
  type?: 'all' | SavedItemType
  category?: string
  country?: string
}
