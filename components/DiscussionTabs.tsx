import Link from 'next/link'

type TabKey = 'today' | 'x'

export default function DiscussionTabs({
  active,
  xCount,
}: {
  active: TabKey
  xCount?: number
}) {
  return (
    <nav className="flex flex-wrap gap-1.5 mb-4" aria-label="Discussion views">
      {active === 'today' ? (
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold border"
          style={{ background: 'var(--forest)', color: 'white', borderColor: 'var(--forest)' }}
          aria-current="page"
        >
          Today
        </span>
      ) : (
        <Link
          href="/"
          className="rounded-full px-3 py-1 text-xs font-semibold border transition-colors hover:border-[var(--forest-light)]"
          style={{ borderColor: 'var(--rule)', color: 'var(--ink-mid)' }}
        >
          Today
        </Link>
      )}
      <Link
        href="/discussions/x"
        className="rounded-full px-3 py-1 text-xs font-semibold border transition-colors hover:border-[var(--forest-light)]"
        style={
          active === 'x'
            ? { background: '#0f1419', color: 'white', borderColor: '#0f1419' }
            : { borderColor: 'var(--rule)', color: 'var(--ink-mid)' }
        }
        aria-current={active === 'x' ? 'page' : undefined}
      >
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">𝕏</span>
          All on X
          {xCount !== undefined && xCount > 0 ? (
            <span
              className="inline-flex min-w-[1.1rem] justify-center rounded-full px-1 text-[0.6rem] font-bold"
              style={{
                background: active === 'x' ? 'rgba(255,255,255,0.2)' : 'var(--emerald-fade)',
                color: active === 'x' ? 'white' : 'var(--forest-mid)',
              }}
            >
              {xCount > 99 ? '99+' : xCount}
            </span>
          ) : null}
        </span>
      </Link>
    </nav>
  )
}
