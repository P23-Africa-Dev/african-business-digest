'use client'

import { useState } from 'react'
import { ExternalLink, ChevronDown, ChevronUp, Bookmark, Trash2 } from 'lucide-react'
import type { Story } from '@/lib/types'
import { CATEGORY_LABELS } from '@/lib/types'
import { flagAndLabelForCountryTag } from '@/lib/regions'
import ConfirmActionModal from './ConfirmActionModal'

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface Props {
  story: Story
  isSaved?: boolean
  onSavedChange?: (saved: boolean) => void
}

export default function StoryCard({ story, isSaved = false, onSavedChange }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [saved, setSaved] = useState(isSaved)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const sources = story.sources ?? []
  const countryDisplay = story.country_tags
    .map((tag) => ({ tag, meta: flagAndLabelForCountryTag(tag) }))
    .filter(
      (x): x is { tag: string; meta: NonNullable<ReturnType<typeof flagAndLabelForCountryTag>> } =>
        x.meta !== null
    )

  const isNew = story.status === 'new'
  const isDeveloping = story.status === 'developing'

  async function saveStory() {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: 'story', itemId: story.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Save failed')
      }
      setSaved(true)
      onSavedChange?.(true)
      setNotice('Saved to briefcase')
      setSaveModalOpen(false)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function removeStory() {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch('/api/saved', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: 'story', itemId: story.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Remove failed')
      }
      setSaved(false)
      onSavedChange?.(false)
      setNotice('Removed from briefcase')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <article
      className="story-card rounded-xl border p-5 md:p-6"
      style={{ borderColor: 'var(--rule)' }}
    >
      {/* Headline */}
      <h3 className="font-display text-xl leading-snug mb-2.5" style={{ color: 'var(--ink)' }}>
        {story.headline}
      </h3>

      {/* Summary */}
      <p className="text-[0.95rem] leading-relaxed mb-5" style={{ color: 'var(--ink-mid)' }}>
        {story.summary}
      </p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs">
        {/* Category badge */}
        <span
          className="px-2.5 py-0.5 rounded-md font-semibold"
          style={{ background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid #f2d8a5' }}
        >
          {CATEGORY_LABELS[story.category]}
        </span>

        {/* Status pill */}
        {isNew && (
          <span
            className="badge-new px-2 py-0.5 rounded-full font-semibold tracking-wide uppercase shadow-sm"
            style={{ background: 'var(--forest)', color: 'white', fontSize: '0.65rem' }}
          >
            New
          </span>
        )}
        {isDeveloping && (
          <span
            className="px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
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
          <span className="font-medium" style={{ color: 'var(--fading-text)' }}>
          {story.last_updated_at !== story.first_seen_at &&
          new Date(story.last_updated_at).toDateString() !== new Date(story.first_seen_at).toDateString() ? (
            <span title={`First seen ${formatAge(story.first_seen_at)}`}>
              updated {formatAge(story.last_updated_at)}
            </span>
          ) : (
            formatAge(story.first_seen_at)
          )}
        </span>
        {saved ? (
          <>
            <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wide" style={{ background: 'var(--emerald-fade)', color: 'var(--forest-mid)' }}>
              Saved
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ml-auto"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink-soft)' }}
              onClick={removeStory}
              disabled={saving}
            >
              <Trash2 size={12} />
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ml-auto"
            style={{ borderColor: 'var(--rule)', color: 'var(--forest-mid)' }}
            onClick={() => setSaveModalOpen(true)}
            disabled={saving}
          >
            <Bookmark size={12} />
            Save
          </button>
        )}
      </div>
      {notice && (
        <p className="text-xs mt-2" style={{ color: 'var(--ink-soft)' }}>
          {notice}
        </p>
      )}

      {/* Sources toggle */}
      {sources.length > 0 && (
        <div className="mt-4 pt-3.5" style={{ borderTop: '1px solid var(--rule-light)' }}>
          <button
            onClick={() => setSourcesOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: 'var(--forest)' }}
            aria-expanded={sourcesOpen}
          >
            {sourcesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </button>

          {sourcesOpen && (
            <ul className="mt-2.5 space-y-2">
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
    <ConfirmActionModal
      open={saveModalOpen}
      title="Save story?"
      description="Do you want to save this story to your Briefcase?"
      confirmLabel="Yes, save"
      loading={saving}
      onCancel={() => setSaveModalOpen(false)}
      onConfirm={saveStory}
    />
    </>
  )
}
