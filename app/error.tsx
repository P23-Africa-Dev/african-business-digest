'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[Error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--parchment)' }}>
      <div className="text-center max-w-md">
        <AlertTriangle className="mx-auto mb-4 opacity-40" size={40} style={{ color: 'var(--forest)' }} />
        <h2 className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--forest)' }}>
          Something went wrong
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
          The digest couldn&apos;t load. This is usually a temporary issue.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--forest)' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
