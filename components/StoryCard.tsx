'use client'

import { useState } from 'react'
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import type { Story } from '@/lib/types'
import { CATEGORY_LABELS } from '@/lib/types'
import { flagAndLabelForCountryTag } from '@/lib/regions'

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface Props {
  story: Story
}

export default function StoryCard({ story }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const sources = story.sources ?? []
  const countryDisplay = story.country_tags
    .map((tag) => ({ tag, meta: flagAndLabelForCountryTag(tag) }))
    .filter(
      (x): x is { tag: string; meta: NonNullable<ReturnType<typeof flagAndLabelForCountryTag>> } =>
        x.meta !== null
    )

  const isNew = story.status === 'new'
  const isDeveloping = story.status === 'developing'

  return (
    <article
      className="story-card bg-white rounded-lg border p-5"
      style={{ borderColor: 'var(--rule)' }}
    >
      {/* Headline */}
      <h3 className="font-display text-lg leading-snug mb-2" style={{ color: 'var(--ink)' }}>
        {story.headline}
      </h3>

      {/* Summary */}
      <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ink-mid)' }}>
        {story.summary}
      </p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Category badge */}
        <span
          className="px-2 py-0.5 rounded font-medium"
          style={{ background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid #f0e0b0' }}
        >
          {CATEGORY_LABELS[story.category]}
        </span>

        {/* Status pill */}
        {isNew && (
          <span
            className="badge-new px-2 py-0.5 rounded-full font-semibold tracking-wide uppercase"
            style={{ background: 'var(--forest)', color: 'white', fontSize: '0.65rem' }}
          >
            New
          </span>
        )}
        {isDeveloping && (
          <span
            className="px-2 py-0.5 rounded-full font-medium uppercase tracking-wide"
            style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.65rem' }}
          >
            Developing
          </span>
        )}

        {/* Country flags */}
        {countryDisplay.map(({ tag, meta: c }) => (
          <span key={tag} title={c.label} className="flex items-center gap-0.5">
            <span>{c.emoji}</span>
            <span style={{ color: 'var(--ink-soft)' }}>{c.label}</span>
          </span>
        ))}

        {/* Age */}
        <span style={{ color: 'var(--fading-text)', marginLeft: 'auto' }}>
          {formatAge(story.first_seen_at)}
        </span>
      </div>

      {/* Sources toggle */}
      {sources.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--rule-light)' }}>
          <button
            onClick={() => setSourcesOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: 'var(--forest)' }}
            aria-expanded={sourcesOpen}
          >
            {sourcesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </button>

          {sourcesOpen && (
            <ul className="mt-2 space-y-1.5">
              {sources.map((src) => {
                const item = src.raw_item
                if (!item) return null
                return (
                  <li key={src.id} className="flex items-start gap-1.5">
                    {src.is_primary && (
                      <span
                        className="mt-0.5 text-xs font-semibold shrink-0"
                        style={{ color: 'var(--amber)' }}
                      >
                        ★
                      </span>
                    )}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs leading-snug flex items-center gap-1 hover:underline"
                      style={{ color: 'var(--forest-mid)' }}
                    >
                      <span>{item.title}</span>
                      <ExternalLink size={10} className="shrink-0 opacity-60" />
                    </a>
                    {item.source_name && (
                      <span className="text-xs shrink-0" style={{ color: 'var(--ink-soft)' }}>
                        — {item.source_name}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}
