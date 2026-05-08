'use client'

import { useState } from 'react'
import { MessageSquare, ExternalLink, Bookmark, Trash2 } from 'lucide-react'
import type { Discussion } from '@/lib/types'
import { flagAndLabelForCountryTag } from '@/lib/regions'
import ConfirmActionModal from './ConfirmActionModal'

function platformIcon(platform: string): string {
  if (platform.startsWith('r/')) return '🟠'
  if (platform.includes('twitter') || platform.includes('x.com')) return '𝕏'
  return '💬'
}

export default function DiscussionItem({
  discussion,
  isSaved = false,
  onSavedChange,
}: {
  discussion: Discussion
  isSaved?: boolean
  onSavedChange?: (saved: boolean) => void
}) {
  const [saved, setSaved] = useState(isSaved)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const countries = discussion.country_tags
    .map((t) => ({ t, meta: flagAndLabelForCountryTag(t) }))
    .filter(
      (x): x is { t: string; meta: NonNullable<ReturnType<typeof flagAndLabelForCountryTag>> } =>
        x.meta !== null
    )

  async function saveDiscussion() {
    setWorking(true)
    setNotice(null)
    try {
      const res = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: 'discussion', itemId: discussion.id }),
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
      setWorking(false)
    }
  }

  async function removeDiscussion() {
    setWorking(true)
    setNotice(null)
    try {
      const res = await fetch('/api/saved', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: 'discussion', itemId: discussion.id }),
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
      setWorking(false)
    }
  }

  return (
    <>
    <div
      className="rounded-xl border p-3.5 transition-all hover:border-[var(--forest-light)] group"
      style={{ borderColor: 'var(--rule)', background: 'var(--paper)' }}
    >
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{platformIcon(discussion.platform)}</span>
        <div className="min-w-0">
          <a
            href={discussion.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline block"
            style={{ color: 'var(--ink)' }}
          >
            {discussion.title}
          </a>
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
            <a
              href={discussion.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto opacity-30 group-hover:opacity-60 transition-opacity shrink-0"
              aria-label="Open discussion"
            >
              <ExternalLink size={10} style={{ color: 'var(--ink)' }} />
            </a>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {saved ? (
              <>
                <span
                  className="px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wide"
                  style={{ background: 'var(--emerald-fade)', color: 'var(--forest-mid)' }}
                >
                  Saved
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
                  style={{ borderColor: 'var(--rule)', color: 'var(--ink-soft)' }}
                  onClick={removeDiscussion}
                  disabled={working}
                >
                  <Trash2 size={11} />
                  Remove
                </button>
              </>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
                style={{ borderColor: 'var(--rule)', color: 'var(--forest-mid)' }}
                onClick={() => setSaveModalOpen(true)}
                disabled={working}
              >
                <Bookmark size={11} />
                Save
              </button>
            )}
          </div>
          {notice && (
            <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
              {notice}
            </p>
          )}
        </div>
      </div>
    </div>
    <ConfirmActionModal
      open={saveModalOpen}
      title="Save discussion?"
      description="Do you want to save this discussion to your Briefcase?"
      confirmLabel="Yes, save"
      loading={working}
      onCancel={() => setSaveModalOpen(false)}
      onConfirm={saveDiscussion}
    />
    </>
  )
}
