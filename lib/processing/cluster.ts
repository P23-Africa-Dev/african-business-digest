import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/db/client'
import { LLM_COUNTRY_TAG_HINTS } from '@/lib/regions'
import { ClusterResponseSchema } from './schemas'
import { recordUsage } from './budget'
import {
  isCategoryEnumMismatch,
  toDbSafeCategory,
  toDbSafeCategoryStrict,
} from './categories'

const BATCH_SIZE = 50

function computeStoryIngestLane(
  matchingItems: Array<{ url: string; ingest_lane?: string | null }>,
  primaryUrl: string | undefined
): 'business_core' | 'trending_broad' {
  if (matchingItems.length === 0) return 'business_core'
  if (primaryUrl) {
    const primary = matchingItems.find((i) => i.url === primaryUrl)
    if (primary?.ingest_lane === 'trending_broad') return 'trending_broad'
    if (primary?.ingest_lane === 'business_core') return 'business_core'
  }
  return matchingItems.some((i) => i.ingest_lane === 'trending_broad') ? 'trending_broad' : 'business_core'
}

const SYSTEM_PROMPT = `You are an expert African news analyst. Your task is to cluster raw news items into coherent stories and produce a structured digest.

For each cluster of related items:
1. Write a synthesized headline (factual, neutral, 10-20 words)
2. Write a 2-3 sentence summary (paraphrase, never quote directly, neutral journalism tone, no speculation)
3. Assign ONE category from: fintech, logistics, energy, retail, deals_funding, policy, business_failures, agriculture, infrastructure, consumer_markets, society, trending
   - Use "society" for elections, civic life, public health, education, culture where not purely business-sector.
   - Use "trending" for viral or fast-moving pan-regional topics that are not a better sector fit.
4. Infer country tags from the content (use only these slugs: ${LLM_COUNTRY_TAG_HINTS})
5. Score relevance to "stories worth knowing for people following Africa" from 0-100 (30+ = newsworthy, 70+ = significant, 90+ = major)
6. List all source URLs that cover this story, identify the most primary/complete source

Each input item includes "ingest_lane": either "business_core" (business and business-adjacent) or "trending_broad" (broader African trending — politics, economy, infrastructure, major national events).

Rules:
- Items covering the same underlying event MUST be in the same cluster
- Do NOT create clusters from a single unrelated item unless it is genuinely significant
- NEVER quote more than 5 consecutive words from any source
- Flag speculative or low-confidence items with relevance_score below 30
- For items with ingest_lane "business_core": ignore memes, entertainment, and politics unrelated to business or the economy.
- For items with ingest_lane "trending_broad": you MAY cluster politics, elections, major civic events, and national economy stories when they are genuinely newsworthy; still ignore pure memes, gossip, and sports unless there is clear economy or policy impact.
- Write in third person, present-or-recent tense

Respond with valid JSON matching the schema exactly.`

export async function clusterRawItems(): Promise<number> {
  const db = createServerClient()
  const client = new Anthropic()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const rawSelectFull =
    'id, title, raw_content, url, source_name, source_type, country_tags, published_at, ingest_lane'
  const rawSelectLegacy =
    'id, title, raw_content, url, source_name, source_type, country_tags, published_at'

  const CLUSTER_SOURCE_TYPES = ['news', 'reddit', 'search'] as const

  const fullRes = await db
    .from('raw_items')
    .select(rawSelectFull)
    .in('source_type', [...CLUSTER_SOURCE_TYPES])
    .gte('ingested_at', cutoff)
    .order('published_at', { ascending: false })

  type RawRow = {
    id: string
    title: string
    raw_content: string | null
    url: string
    source_name: string
    source_type: string
    country_tags: string[]
    published_at: string | null
    ingest_lane?: string | null
  }

  let rawItems: RawRow[]
  if (fullRes.error?.message?.includes('ingest_lane')) {
    const legacy = await db
      .from('raw_items')
      .select(rawSelectLegacy)
      .in('source_type', [...CLUSTER_SOURCE_TYPES])
      .gte('ingested_at', cutoff)
      .order('published_at', { ascending: false })
    if (legacy.error) {
      console.error('[Cluster] raw_items query failed:', legacy.error)
      return 0
    }
    rawItems = (legacy.data ?? []).map((r) => ({ ...r, ingest_lane: 'business_core' }))
  } else if (fullRes.error) {
    console.error('[Cluster] raw_items query failed:', fullRes.error)
    return 0
  } else {
    rawItems = (fullRes.data ?? []).map((r) => ({
      ...r,
      ingest_lane: (r as RawRow).ingest_lane ?? 'business_core',
    }))
  }

  if (rawItems.length === 0) {
    console.log('[Cluster] No raw items to process')
    return 0
  }

  console.log(`[Cluster] Processing ${rawItems.length} items in batches of ${BATCH_SIZE}`)
  let storiesCreated = 0

  // Batch items to stay within context limits
  for (let i = 0; i < rawItems.length; i += BATCH_SIZE) {
    const batch = rawItems.slice(i, i + BATCH_SIZE)

    const itemsJson = batch.map((item) => ({
      url: item.url,
      title: item.title,
      snippet: item.raw_content?.slice(0, 500),
      source: item.source_name,
      country_hints: item.country_tags,
      ingest_lane: item.ingest_lane ?? 'business_core',
    }))

    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000, // 4096 was truncating 46-item batches mid-JSON
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Cluster and synthesize these ${batch.length} news items:\n\n${JSON.stringify(itemsJson, null, 2)}\n\nRespond with JSON only, no markdown: { "stories": [...] }`,
          },
        ],
      })
      await recordUsage('claude-sonnet-4-6', response.usage.input_tokens, response.usage.output_tokens)
    } catch (err) {
      console.error(`[Cluster] API call failed for batch ${i}:`, err)
      continue
    }

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    let parsed

    function extractJson(text: string): string {
      const codeBlock = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
      if (codeBlock) return codeBlock[1]
      const obj = text.match(/\{[\s\S]*\}/)
      return obj ? obj[0] : text
    }

    try {
      parsed = ClusterResponseSchema.parse(JSON.parse(extractJson(rawText)))
    } catch (firstErr) {
      console.error('[Cluster] First parse failed:', firstErr)
      console.error('[Cluster] Raw response (first 500 chars):', rawText.slice(0, 500))
      // Retry once — ask Claude to fix the response
      try {
        const retry = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Cluster these news items. Return ONLY a raw JSON object, key must be "stories":\n\n${JSON.stringify(itemsJson, null, 2)}`,
            },
          ],
        })
        await recordUsage('claude-sonnet-4-6', retry.usage.input_tokens, retry.usage.output_tokens)
        const retryText = retry.content[0].type === 'text' ? retry.content[0].text : ''
        console.error('[Cluster] Retry raw response (first 300):', retryText.slice(0, 300))
        const retryJson = JSON.parse(extractJson(retryText))
        // Handle alternative top-level keys Claude sometimes uses
        const normalized = retryJson.stories ?? retryJson.story_list ?? retryJson.clusters ?? Object.values(retryJson)[0]
        parsed = ClusterResponseSchema.parse({ stories: Array.isArray(normalized) ? normalized : [] })
      } catch (retryErr) {
        console.error(`[Cluster] Schema validation failed for batch ${i}, skipping:`, retryErr)
        continue
      }
    }

    // Persist each story and its source links
    for (const story of parsed.stories) {
      if (story.relevance_score < 30) continue

      const matchingItems = rawItems.filter((item) => story.source_urls?.includes(item.url))
      const storyLane = computeStoryIngestLane(matchingItems, story.primary_url)

      const baseRow = {
        headline: story.headline,
        summary: story.summary,
        category: toDbSafeCategory(story.category),
        country_tags: story.country_tags,
        relevance_score: story.relevance_score,
        status: 'new' as const,
        first_seen_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      }

      let insertedRow: { id: string } | null = null
      const categoryAttempts = [
        baseRow.category,
        toDbSafeCategoryStrict(story.category),
        'policy',
      ]
      const uniqueCategories = [...new Set(categoryAttempts)]

      for (const category of uniqueCategories) {
        if (insertedRow) break
        const row = { ...baseRow, category }
        const withLane = await db
          .from('stories')
          .insert({ ...row, ingest_lane: storyLane })
          .select('id')
          .single()

        if (!withLane.error && withLane.data) {
          insertedRow = withLane.data
          break
        }

        if (withLane.error?.message?.includes('ingest_lane')) {
          const noLane = await db.from('stories').insert(row).select('id').single()
          if (!noLane.error && noLane.data) {
            insertedRow = noLane.data
            break
          }
          if (!isCategoryEnumMismatch(noLane.error)) {
            console.error('[Cluster] Failed to insert story:', noLane.error)
          }
          continue
        }

        if (!isCategoryEnumMismatch(withLane.error)) {
          console.error('[Cluster] Failed to insert story:', withLane.error)
          break
        }
      }

      if (!insertedRow) continue

      if (matchingItems.length > 0) {
        await db.from('story_sources').insert(
          matchingItems.map((item) => ({
            story_id: insertedRow.id,
            raw_item_id: item.id,
            is_primary: item.url === story.primary_url,
          }))
        )
      }

      storiesCreated++
    }
  }

  return storiesCreated
}
