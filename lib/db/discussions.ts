import { createServerClient } from './client'
import { isDiscussionFromX } from '@/lib/discussions/display'
import { isValidCountryFilter } from '@/lib/regions'
import type { Discussion } from '@/lib/types'

const DEFAULT_CUTOFF_DAYS = 7
const DEFAULT_LIMIT = 200

function baseQuery(cutoff: string, limit: number, country?: string) {
  const db = createServerClient()
  let q = db
    .from('discussions')
    .select('*')
    .gte('ingested_at', cutoff)
    .order('engagement_score', { ascending: false })
    .limit(limit)
  if (country) {
    q = q.contains('country_tags', [country])
  }
  return q
}

export async function getXDiscussions(params?: {
  country?: string
  cutoffDays?: number
  limit?: number
}): Promise<{ discussions: Discussion[]; total: number }> {
  const cutoffDays = params?.cutoffDays ?? DEFAULT_CUTOFF_DAYS
  const limit = params?.limit ?? DEFAULT_LIMIT
  const country = params?.country && isValidCountryFilter(params.country) ? params.country : undefined
  const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString()

  let result = await baseQuery(cutoff, limit, country).eq('source_type', 'twitter')
  if (result.error?.message?.includes('source_type')) {
    result = await baseQuery(cutoff, limit, country).or('url.ilike.%x.com%,url.ilike.%twitter.com%')
  }

  if (result.error) {
    console.error('[DB:getXDiscussions] Query failed:', result.error)
    throw new Error('X discussions query failed')
  }

  const rows = (result.data ?? []) as Discussion[]
  const discussions = rows.filter(isDiscussionFromX)

  return { discussions, total: discussions.length }
}
