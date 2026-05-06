import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/db/client'
import { LLM_COUNTRY_TAG_HINTS } from '@/lib/regions'
import { ClusterResponseSchema } from './schemas'
import { recordUsage } from './budget'

const BATCH_SIZE = 50

const SYSTEM_PROMPT = `You are an expert African business news analyst. Your task is to cluster raw news items into coherent stories and produce a structured digest.

For each cluster of related items:
1. Write a synthesized headline (factual, neutral, 10-20 words)
2. Write a 2-3 sentence summary (paraphrase, never quote directly, neutral business-journalism tone, no speculation)
3. Assign ONE category from: fintech, logistics, energy, retail, deals_funding, policy, business_failures, agriculture, infrastructure, consumer_markets
4. Infer country tags from the content (use only these slugs: ${LLM_COUNTRY_TAG_HINTS})
5. Score relevance to "African business news worth knowing" from 0-100 (30+ = newsworthy, 70+ = significant, 90+ = major)
6. List all source URLs that cover this story, identify the most primary/complete source

Rules:
- Items covering the same underlying event MUST be in the same cluster
- Do NOT create clusters from a single unrelated item unless it is genuinely significant
- NEVER quote more than 5 consecutive words from any source
- Flag speculative or low-confidence items with relevance_score below 30
- Ignore memes, entertainment, politics unrelated to business
- Write in third person, present-or-recent tense

Respond with valid JSON matching the schema exactly.`

export async function clusterRawItems(): Promise<number> {
  const db = createServerClient()
  const client = new Anthropic()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: rawItems } = await db
    .from('raw_items')
    .select('id, title, raw_content, url, source_name, source_type, country_tags, published_at')
    .gte('ingested_at', cutoff)
    .order('published_at', { ascending: false })

  if (!rawItems || rawItems.length === 0) {
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

      const { data: inserted, error } = await db
        .from('stories')
        .insert({
          headline: story.headline,
          summary: story.summary,
          category: story.category,
          country_tags: story.country_tags,
          relevance_score: story.relevance_score,
          status: 'new',
          first_seen_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error || !inserted) {
        console.error('[Cluster] Failed to insert story:', error)
        continue
      }

      // Link source URLs to the story
      const matchingItems = rawItems.filter((item) => story.source_urls?.includes(item.url))
      if (matchingItems.length > 0) {
        await db.from('story_sources').insert(
          matchingItems.map((item) => ({
            story_id: inserted.id,
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
