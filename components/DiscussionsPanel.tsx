import DiscussionItem from './DiscussionItem'
import DiscussionTabs from './DiscussionTabs'
import type { Discussion } from '@/lib/types'
import { isDiscussionFromX } from '@/lib/discussions/display'

export default function DiscussionsPanel({
  discussions,
  savedDiscussionIds = [],
}: {
  discussions: Discussion[]
  savedDiscussionIds?: string[]
}) {
  const savedSet = new Set(savedDiscussionIds)
  const xDiscussions = discussions.filter(isDiscussionFromX)
  const otherDiscussions = discussions.filter((d) => !isDiscussionFromX(d))

  return (
    <aside aria-label="What people are discussing">
      <div className="sticky top-[96px] rounded-2xl p-4 frost-panel">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="text-xl h-8 w-8 rounded-full border inline-flex items-center justify-center bg-white"
              style={{ borderColor: 'var(--rule-light)' }}
              aria-hidden="true"
            >
              💬
            </span>
            <h2 className="font-display text-xl font-bold tracking-tight" style={{ color: 'var(--forest)' }}>
              Discussions
            </h2>
          </div>
          <DiscussionTabs active="today" xCount={xDiscussions.length} />
          <hr className="rule-double mb-4" />

          {discussions.length === 0 ? (
            <p className="text-sm italic" style={{ color: 'var(--fading-text)' }}>
              No notable discussions today.
            </p>
          ) : (
            <>
              {xDiscussions.length > 0 ? (
                <section className="mb-5" aria-labelledby="pulse-on-x-heading">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span
                      className="text-sm font-bold w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0"
                      style={{ background: '#0f1419', color: '#fff' }}
                      aria-hidden="true"
                    >
                      𝕏
                    </span>
                    <h3
                      id="pulse-on-x-heading"
                      className="font-display text-sm font-bold tracking-tight"
                      style={{ color: 'var(--forest)' }}
                    >
                      Pulse on X
                    </h3>
                    <span
                      className="text-[0.65rem] font-semibold uppercase tracking-wide ml-auto"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {xDiscussions.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {xDiscussions.map((d) => (
                      <DiscussionItem key={d.id} discussion={d} isSaved={savedSet.has(d.id)} variant="x" />
                    ))}
                  </div>
                </section>
              ) : null}

              {otherDiscussions.length > 0 ? (
                <section aria-labelledby={xDiscussions.length > 0 ? 'discussions-web-heading' : undefined}>
                  {xDiscussions.length > 0 ? (
                    <h3
                      id="discussions-web-heading"
                      className="font-display text-xs font-bold uppercase tracking-[0.14em] mb-2.5"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      Across the web
                    </h3>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {otherDiscussions.map((d) => (
                      <DiscussionItem key={d.id} discussion={d} isSaved={savedSet.has(d.id)} />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
      </div>
    </aside>
  )
}
