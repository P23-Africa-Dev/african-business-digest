import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--parchment)' }}>
      <div className="text-center">
        <p className="font-display text-7xl font-bold mb-2 opacity-10" style={{ color: 'var(--forest)' }}>404</p>
        <h2 className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--forest)' }}>Page not found</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>
          That page doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="px-5 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--forest)' }}
        >
          Back to digest
        </Link>
      </div>
    </div>
  )
}
