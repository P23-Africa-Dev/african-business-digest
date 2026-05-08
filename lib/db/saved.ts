import { createServerClient } from './client'
import type { Discussion, SavedFilters, SavedItem, SaveItemPayload, Story } from '@/lib/types'

function normalizeFilters(filters?: SavedFilters): Required<SavedFilters> {
  return {
    type: filters?.type ?? 'all',
    category: filters?.category ?? '',
    country: filters?.country ?? '',
  }
}

export async function getSavedItems(filters?: SavedFilters): Promise<{
  stories: Story[]
  discussions: Discussion[]
  saved: SavedItem[]
}> {
  const db = createServerClient()
  const f = normalizeFilters(filters)

  let q = db.from('saved_items').select('*').order('created_at', { ascending: false }).limit(500)
  if (f.type === 'story' || f.type === 'discussion') q = q.eq('item_type', f.type)
  if (f.category) q = q.eq('category_snapshot', f.category)
  if (f.country) q = q.contains('country_tags_snapshot', [f.country])

  const { data: savedRows, error } = await q
  if (error) throw new Error(`Saved query failed: ${error.message}`)

  const saved = (savedRows ?? []) as SavedItem[]
  const storyIds = saved.map((s) => s.story_id).filter((v): v is string => Boolean(v))
  const discussionIds = saved.map((s) => s.discussion_id).filter((v): v is string => Boolean(v))

  const [storiesRes, discussionsRes] = await Promise.all([
    storyIds.length
      ? db.from('stories').select('*').in('id', storyIds)
      : Promise.resolve({ data: [], error: null }),
    discussionIds.length
      ? db.from('discussions').select('*').in('id', discussionIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (storiesRes.error) throw new Error(`Saved stories query failed: ${storiesRes.error.message}`)
  if (discussionsRes.error) throw new Error(`Saved discussions query failed: ${discussionsRes.error.message}`)

  const storiesMap = new Map((storiesRes.data ?? []).map((s) => [s.id, s]))
  const discussionsMap = new Map((discussionsRes.data ?? []).map((d) => [d.id, d]))

  const stories: Story[] = []
  const discussions: Discussion[] = []

  for (const row of saved) {
    if (row.item_type === 'story' && row.story_id) {
      const s = storiesMap.get(row.story_id)
      if (s) stories.push(s as Story)
    }
    if (row.item_type === 'discussion' && row.discussion_id) {
      const d = discussionsMap.get(row.discussion_id)
      if (d) discussions.push(d as Discussion)
    }
  }

  return { stories, discussions, saved }
}

export async function saveItem(payload: SaveItemPayload): Promise<{ saved: SavedItem }> {
  const db = createServerClient()
  const { itemType, itemId } = payload
  if (!itemId) throw new Error('itemId is required')
  if (itemType !== 'story' && itemType !== 'discussion') throw new Error('Invalid itemType')

  if (itemType === 'story') {
    const { data: story, error: storyErr } = await db.from('stories').select('*').eq('id', itemId).maybeSingle()
    if (storyErr) throw new Error(`Story lookup failed: ${storyErr.message}`)
    if (!story) throw new Error('Story not found')
    const toInsert = {
      item_type: 'story',
      story_id: story.id,
      discussion_id: null,
      title_snapshot: story.headline,
      url_snapshot: null,
      category_snapshot: story.category ?? null,
      country_tags_snapshot: story.country_tags ?? [],
    }
    const inserted = await db.from('saved_items').insert(toInsert).select('*').maybeSingle()
    if (!inserted.error && inserted.data) return { saved: inserted.data as SavedItem }
    if (inserted.error && inserted.error.code === '23505') {
      const existing = await db.from('saved_items').select('*').eq('story_id', story.id).maybeSingle()
      if (existing.error || !existing.data) {
        throw new Error(`Save failed: ${inserted.error.message}`)
      }
      return { saved: existing.data as SavedItem }
    }
    throw new Error(`Save failed: ${inserted.error?.message ?? 'Unknown insert error'}`)
  }

  const { data: discussion, error: discussionErr } = await db
    .from('discussions')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  if (discussionErr) throw new Error(`Discussion lookup failed: ${discussionErr.message}`)
  if (!discussion) throw new Error('Discussion not found')

  const toInsert = {
    item_type: 'discussion',
    story_id: null,
    discussion_id: discussion.id,
    title_snapshot: discussion.title,
    url_snapshot: discussion.url ?? null,
    category_snapshot: discussion.category ?? null,
    country_tags_snapshot: discussion.country_tags ?? [],
  }
  const inserted = await db.from('saved_items').insert(toInsert).select('*').maybeSingle()
  if (!inserted.error && inserted.data) return { saved: inserted.data as SavedItem }
  if (inserted.error && inserted.error.code === '23505') {
    const existing = await db
      .from('saved_items')
      .select('*')
      .eq('discussion_id', discussion.id)
      .maybeSingle()
    if (existing.error || !existing.data) {
      throw new Error(`Save failed: ${inserted.error.message}`)
    }
    return { saved: existing.data as SavedItem }
  }
  throw new Error(`Save failed: ${inserted.error?.message ?? 'Unknown insert error'}`)
}

export async function removeSavedItem(payload: SaveItemPayload): Promise<{ removed: boolean }> {
  const db = createServerClient()
  const { itemType, itemId } = payload
  if (!itemId) throw new Error('itemId is required')
  if (itemType !== 'story' && itemType !== 'discussion') throw new Error('Invalid itemType')
  const col = itemType === 'story' ? 'story_id' : 'discussion_id'
  const { error } = await db.from('saved_items').delete().eq(col, itemId)
  if (error) throw new Error(`Remove failed: ${error.message}`)
  return { removed: true }
}

export async function getSavedLookup(args: {
  storyIds?: string[]
  discussionIds?: string[]
}): Promise<{ storyIds: string[]; discussionIds: string[] }> {
  const db = createServerClient()
  const stories = args.storyIds ?? []
  const discussions = args.discussionIds ?? []
  const [savedStories, savedDiscussions] = await Promise.all([
    stories.length
      ? db.from('saved_items').select('story_id').in('story_id', stories)
      : Promise.resolve({ data: [], error: null }),
    discussions.length
      ? db.from('saved_items').select('discussion_id').in('discussion_id', discussions)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (savedStories.error) throw new Error(`Saved lookup failed: ${savedStories.error.message}`)
  if (savedDiscussions.error) throw new Error(`Saved lookup failed: ${savedDiscussions.error.message}`)
  return {
    storyIds: (savedStories.data ?? [])
      .map((r) => r.story_id)
      .filter((v): v is string => typeof v === 'string'),
    discussionIds: (savedDiscussions.data ?? [])
      .map((r) => r.discussion_id)
      .filter((v): v is string => typeof v === 'string'),
  }
}
