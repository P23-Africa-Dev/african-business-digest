import { MessageSquare, ExternalLink } from 'lucide-react'
import type { Discussion } from '@/lib/types'
import { flagAndLabelForCountryTag } from '@/lib/regions'

function platformIcon(platform: string): string {
  if (platform.startsWith('r/')) return '🟠'
  if (platform.includes('twitter') || platform.includes('x.com')) return '𝕏'
  return '💬'
}

export default function DiscussionItem({ discussion }: { discussion: Discussion }) {
  const countries = discussion.country_tags
    .map((t) => ({ t, meta: flagAndLabelForCountryTag(t) }))
    .filter(
      (x): x is { t: string; meta: NonNullable<ReturnType<typeof flagAndLabelForCountryTag>> } =>
        x.meta !== null
    )

  return (
    <a
      href={discussion.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border p-3.5 transition-colors hover:border-[var(--forest-light)] group"
      style={{ borderColor: 'var(--rule)', background: 'white' }}
    >
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{platformIcon(discussion.platform)}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:underline" style={{ color: 'var(--ink)' }}>
            {discussion.title}
          </p>
          {discussion.excerpt && (
            <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--ink-soft)' }}>
              {discussion.excerpt}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              {discussion.platform}
            </span>
            {discussion.engagement_score > 0 && (
              <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--amber)' }}>
                <MessageSquare size={10} />
                {discussion.engagement_score}
              </span>
            )}
            {countries.map(({ t, meta: c }) => (
              <span key={t} className="text-xs" title={c.label}>
                {c.emoji}
              </span>
            ))}
            <ExternalLink size={10} className="ml-auto opacity-30 group-hover:opacity-60 transition-opacity shrink-0" style={{ color: 'var(--ink)' }} />
          </div>
        </div>
      </div>
    </a>
  )
}
