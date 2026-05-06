import { createServerClient } from '@/lib/db/client'

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\W+/).filter((t) => t.length > 3))
  const tokensB = new Set(b.toLowerCase().split(/\W+/).filter((t) => t.length > 3))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let shared = 0
  for (const t of tokensA) if (tokensB.has(t)) shared++
  return shared / Math.min(tokensA.size, tokensB.size)
}

export async function runDiff(): Promise<void> {
  const db = createServerClient()
  const now = new Date()
  const cutoff72h = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString()
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Load recent stories with their source URLs
  const { data: recentStories } = await db
    .from('stories')
    .select('id, headline, status, last_updated_at, story_sources(raw_item_id)')
    .gte('first_seen_at', cutoff72h)
    .order('first_seen_at', { ascending: false })

  if (!recentStories) return

  const newStories = recentStories.filter(
    (s) => new Date(s.last_updated_at) >= new Date(cutoff24h)
  )
  const existingStories = recentStories.filter(
    (s) => new Date(s.last_updated_at) < new Date(cutoff24h)
  )

  // Mark developing: new story shares sources or headline overlap with an older story
  for (const existing of existingStories) {
    const existingSourceIds = new Set(
      (existing.story_sources ?? []).map((ss: { raw_item_id: string }) => ss.raw_item_id)
    )

    for (const newStory of newStories) {
      const newSourceIds = (newStory.story_sources ?? []).map(
        (ss: { raw_item_id: string }) => ss.raw_item_id
      )
      const sharedSources = newSourceIds.some((id: string) => existingSourceIds.has(id))
      const headlineSimilarity = tokenOverlap(existing.headline, newStory.headline)

      if (sharedSources || headlineSimilarity > 0.4) {
        await db
          .from('stories')
          .update({ status: 'developing', last_updated_at: now.toISOString() })
          .eq('id', existing.id)
        break
      }
    }
  }

  // Mark fading: stories with no new sources in 24h and not already fading
  const staleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  await db
    .from('stories')
    .update({ status: 'fading' })
    .lt('last_updated_at', staleCutoff)
    .eq('status', 'developing')
}
