'use client'

import { useEffect, useState } from 'react'

type Status = 'loading' | 'available' | 'ran' | 'running' | 'done' | 'error'

function formatTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
    timeZoneName: 'short',
  })
}

export default function RunDigestButton() {
  const [status, setStatus] = useState<Status>('loading')
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/cron/status')
      .then((r) => r.json())
      .then(({ ranToday, lastRunAt }: { ranToday: boolean; lastRunAt: string | null }) => {
        setLastRunAt(lastRunAt)
        setStatus(ranToday ? 'ran' : 'available')
      })
      .catch(() => setStatus('error'))
  }, [])

  async function handleRun() {
    setStatus('running')
    setNote(null)
    try {
      const res = await fetch('/api/cron/trigger', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.status === 409) {
        setLastRunAt(body.lastRunAt ?? null)
        setStatus('ran')
        return
      }
      if (!res.ok) {
        const detail = body?.ingestResult?.errors?.[0] ?? null
        setNote(detail ? `${body?.message ?? 'Digest run failed'} (${detail})` : (body?.message ?? body?.error ?? 'Digest run failed'))
        setStatus('error')
        return
      }

      if (body?.status === 'ok') {
        setLastRunAt(new Date().toISOString())
        setStatus('done')
        setNote(
          `Added ${body?.storiesCreated ?? 0} stories from ${body?.ingestResult?.persisted ?? 0} ingested items`
        )
        // Give Next.js a moment to finish revalidation, then hard-reload
        setTimeout(() => window.location.reload(), 1500)
        return
      }

      setStatus('error')
      setNote(body?.message ?? `Run finished with status: ${body?.status ?? 'unknown'}`)
    } catch {
      setNote('Network error while triggering digest')
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="mt-2 h-7 w-32 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.15)' }} />
    )
  }

  const disabled = status === 'ran' || status === 'running' || status === 'done'

  const label =
    status === 'running'
      ? 'Running…'
      : status === 'done'
      ? 'Done — refresh to see updates'
      : status === 'ran'
      ? 'Already ran today'
      : status === 'error'
      ? 'Error — try again'
      : 'Run digest now'

  return (
    <div className="mt-2 flex flex-col items-end gap-0.5">
      <button
        onClick={handleRun}
        disabled={disabled}
        className="rounded-md px-3 py-1.5 text-xs font-semibold transition-all"
        style={{
          background: disabled ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.92)',
          color: disabled ? 'rgba(255,255,255,0.55)' : 'var(--forest)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: disabled ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.82)',
        }}
      >
        {status === 'running' && (
          <span className="mr-1.5 inline-block h-2.5 w-2.5 animate-spin rounded-full border border-emerald-300/50 border-t-emerald-800/90" />
        )}
        {label}
      </button>
      {lastRunAt && (status === 'ran' || status === 'done') && (
        <span className="text-[10px] opacity-50">last ran {formatTime(lastRunAt)}</span>
      )}
      {note && <span className="max-w-56 text-right text-[10px] opacity-70">{note}</span>}
    </div>
  )
}
