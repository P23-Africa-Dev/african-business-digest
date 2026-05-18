import { isDiscussionFromX } from '@/lib/discussions/display'
import type { Discussion, Story } from '@/lib/types'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function discussionEffectiveAt(d: { posted_at?: string | null; ingested_at: string }): number {
  const postedMs = d.posted_at ? new Date(d.posted_at).getTime() : Number.NaN
  const ingestedMs = new Date(d.ingested_at).getTime()
  return Number.isFinite(postedMs) ? Math.max(postedMs, ingestedMs) : ingestedMs
}

function isRedditDiscussion(d: Discussion): boolean {
  return d.source_type === 'reddit' || d.platform.startsWith('r/') || d.url.includes('reddit.com')
}

function byEngagementThenRecency(a: Discussion, b: Discussion): number {
  if (b.engagement_score !== a.engagement_score) return b.engagement_score - a.engagement_score
  return discussionEffectiveAt(b) - discussionEffectiveAt(a)
}

/** Ensures X and Reddit are represented in the digest sidebar, not only web/search. */
export function rankDiscussionsForDigest(
  rows: Discussion[],
  cutoffIso: string,
  limit: number
): Discussion[] {
  const cutoffMs = new Date(cutoffIso).getTime()
  const eligible = rows
    .filter((d) => discussionEffectiveAt(d) >= cutoffMs)
    .sort(byEngagementThenRecency)

  const minX = Math.min(8, limit)
  const minReddit = Math.min(5, limit)
  const picked: Discussion[] = []
  const seen = new Set<string>()

  const addFrom = (list: Discussion[], max: number) => {
    let n = 0
    for (const d of list) {
      if (picked.length >= limit || n >= max) break
      if (seen.has(d.id)) continue
      seen.add(d.id)
      picked.push(d)
      n += 1
    }
  }

  addFrom(eligible.filter(isDiscussionFromX), minX)
  addFrom(eligible.filter(isRedditDiscussion), minReddit)
  for (const d of eligible) {
    if (picked.length >= limit) break
    if (seen.has(d.id)) continue
    seen.add(d.id)
    picked.push(d)
  }

  return picked.sort(byEngagementThenRecency)
}

function recentSourceCount(story: Story, now: number, windowMs: number): number {
  let n = 0
  for (const s of story.sources ?? []) {
    const ing = s.raw_item?.ingested_at
    if (ing && now - new Date(ing).getTime() <= windowMs) n += 1
  }
  return n
}

export function storyTrendingScore(story: Story, now: number): number {
  const hoursSinceFirst = (now - new Date(story.first_seen_at).getTime()) / HOUR_MS
  const recencyBoost = hoursSinceFirst <= 6 ? 10 : hoursSinceFirst <= 24 ? 6 : hoursSinceFirst <= 48 ? 3 : 0
  const velocity = Math.min(recentSourceCount(story, now, DAY_MS), 14) * 2.8
  const updatePulse =
    (new Date(story.last_updated_at).getTime() - new Date(story.first_seen_at).getTime()) / DAY_MS
  return story.relevance_score * 0.52 + velocity + recencyBoost + Math.min(updatePulse, 3) * 1.2
}

export function rankStoriesByTrending(stories: Story[]): Story[] {
  const now = Date.now()
  return [...stories].sort((a, b) => storyTrendingScore(b, now) - storyTrendingScore(a, now))
}
