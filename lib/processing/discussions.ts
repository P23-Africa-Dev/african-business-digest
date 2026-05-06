import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/db/client'
import { LLM_COUNTRY_TAG_HINTS } from '@/lib/regions'
import { DiscussionFilterSchema } from './schemas'
import { recordUsage } from './budget'

const SYSTEM_PROMPT = `You are a filter for African business discussions online.

Given an indexed list of Reddit posts and web content, identify which ones represent genuine business discussion.

For each item return:
- index: the original index number from the input (required)
- is_business_relevant: true ONLY if it discusses real business activity, startups, markets, investment, economic policy, or business failures
- excerpt: 1-2 sentence paraphrased summary (neutral tone, no direct quotes)
- country_tags: array using only these slugs: ${LLM_COUNTRY_TAG_HINTS}
- category: one of fintech/logistics/energy/retail/deals_funding/policy/business_failures/agriculture/infrastructure/consumer_markets, or null

Return valid JSON only: { "discussions": [ { "index": 0, "is_business_relevant": true, ... }, ... ] }`

export async function processDiscussions(): Promise<number> {
  const db = createServerClient()
  // Haiku for this lighter filtering pass — ~5x cheaper than Sonnet
  const client = new Anthropic()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: rawItems } = await db
    .from('raw_items')
    .select('id, url, title, raw_content, source_type, source_name, country_tags, published_at, engagement_score')
    .in('source_type', ['reddit', 'search'])
    .gte('ingested_at', cutoff)
    .order('ingested_at', { ascending: false })
    .limit(100)

  if (!rawItems || rawItems.length === 0) return 0

  // Use index instead of URL — Claude often drops or mutates URLs in responses
  const itemsForLLM = rawItems.map((item, idx) => ({
    index: idx,
    title: item.title,
    snippet: item.raw_content?.slice(0, 500) ?? null,
    source: item.source_name,
    country_hints: item.country_tags,
  }))

  let parsed
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Filter and tag these ${rawItems.length} items:\n\n${JSON.stringify(itemsForLLM, null, 2)}\n\nReturn JSON: { "discussions": [...] }`,
        },
      ],
    })
    await recordUsage('claude-haiku-4-5', response.usage.input_tokens, response.usage.output_tokens)

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/)
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : rawText
    parsed = DiscussionFilterSchema.parse(JSON.parse(jsonStr))
  } catch (err) {
    console.error('[Discussions] LLM processing failed:', err)
    return 0
  }

  const relevant = parsed.discussions.filter((d) => d.is_business_relevant)
  if (relevant.length === 0) return 0

  const toInsert = relevant
    .map((d) => {
      const rawItem = rawItems[d.index]
      if (!rawItem) return null
      return {
        platform: rawItem.source_name ?? 'unknown',
        url: rawItem.url,
        title: rawItem.title,
        excerpt: d.excerpt ?? null,
        engagement_score: Math.min(100, Math.max(0, Number(rawItem.engagement_score) || 0)),
        country_tags: d.country_tags,
        category: d.category,
        posted_at: rawItem.published_at ?? null,
        ingested_at: new Date().toISOString(),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const { error } = await db
    .from('discussions')
    .upsert(toInsert, { onConflict: 'url', ignoreDuplicates: false })

  if (error) {
    console.error('[Discussions] Upsert failed:', error)
    return 0
  }

  return relevant.length
}
