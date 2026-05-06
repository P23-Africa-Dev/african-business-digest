import type { Discussion, Story } from '@/lib/types'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function discussionEffectiveAt(d: { posted_at?: string | null; ingested_at: string }): number {
  return new Date(d.posted_at ?? d.ingested_at).getTime()
}

export function rankDiscussionsForDigest(
  rows: Discussion[],
  cutoffIso: string,
  limit: number
): Discussion[] {
  const cutoffMs = new Date(cutoffIso).getTime()
  return rows
    .filter((d) => discussionEffectiveAt(d) >= cutoffMs)
    .sort((a, b) => {
      if (b.engagement_score !== a.engagement_score) return b.engagement_score - a.engagement_score
      return discussionEffectiveAt(b) - discussionEffectiveAt(a)
    })
    .slice(0, limit)
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
