import type { RawItem } from '@/lib/types'

export async function ingestTwitter(): Promise<RawItem[]> {
  if (!process.env.TWITTER_BEARER_TOKEN) return []
  console.info('[Twitter] TWITTER_BEARER_TOKEN is set; connector not implemented yet')
  return []
}
