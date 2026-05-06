export type SourceType = 'news' | 'reddit' | 'search'
export type StoryStatus = 'new' | 'developing' | 'fading'
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

export const CATEGORIES_PRIMARY: Category[] = [
  'fintech',
  'logistics',
  'energy',
  'retail',
  'deals_funding',
  'policy',
  'business_failures',
]
export const CATEGORIES_EXTRA: Category[] = ['agriculture', 'infrastructure', 'consumer_markets']
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
