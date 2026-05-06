import { z } from 'zod'

export const CategorySchema = z.enum([
  'fintech',
  'logistics',
  'energy',
  'retail',
  'deals_funding',
  'policy',
  'business_failures',
  'agriculture',
  'infrastructure',
  'consumer_markets',
])

export const ClusteredStorySchema = z.object({
  headline: z.string().min(5).max(200),
  summary: z.string().min(10).max(600),
  category: CategorySchema,
  country_tags: z.array(z.string()).min(1),
  relevance_score: z.number().int().min(0).max(100),
  source_urls: z.array(z.string().min(1)).optional(),
  primary_url: z.string().min(1).optional(),
})

export const ClusterResponseSchema = z.object({
  stories: z.array(ClusteredStorySchema),
})

export const DiscussionFilterSchema = z.object({
  discussions: z.array(
    z.object({
      index: z.number().int().min(0),  // position in the input array — more reliable than URL echo
      excerpt: z.string().max(300).nullable().optional(),
      country_tags: z.array(z.string()),
      category: CategorySchema.nullable(),
      is_business_relevant: z.boolean(),
    })
  ),
})

export type ClusteredStory = z.infer<typeof ClusteredStorySchema>
export type ClusterResponse = z.infer<typeof ClusterResponseSchema>
export type DiscussionFilter = z.infer<typeof DiscussionFilterSchema>
