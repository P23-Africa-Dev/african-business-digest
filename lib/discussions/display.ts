import type { Discussion, SourceType } from '@/lib/types'

export function isDiscussionFromX(d: Pick<Discussion, 'source_type' | 'url' | 'platform'>): boolean {
  if (d.source_type === 'twitter') return true
  const p = d.platform.toLowerCase()
  const u = d.url.toLowerCase()
  return p.includes('x.com') || p.includes('twitter') || p === 'x' || u.includes('x.com') || u.includes('twitter.com')
}

export function discussionPlatformLabel(d: Pick<Discussion, 'source_type' | 'platform' | 'url'>): string {
  if (isDiscussionFromX(d)) return 'X'
  if (d.source_type === 'reddit' || d.platform.startsWith('r/')) {
    return d.platform.startsWith('r/') ? d.platform : 'Reddit'
  }
  if (d.source_type === 'youtube') return 'YouTube'
  if (d.source_type === 'search') return d.platform || 'Web'
  if (d.source_type === 'news') return d.platform || 'News'
  return d.platform || 'Web'
}

export function discussionPlatformForDb(sourceType: SourceType, sourceName: string): string {
  if (sourceType === 'twitter') return 'X'
  if (sourceType === 'reddit' && sourceName.startsWith('r/')) return sourceName
  if (sourceType === 'reddit') return 'Reddit'
  if (sourceType === 'youtube') return 'YouTube'
  return sourceName || 'Web'
}
