import Link from 'next/link'
import DiscussionItem from '@/components/DiscussionItem'
import DiscussionTabs from '@/components/DiscussionTabs'
import { getXDiscussions } from '@/lib/db/discussions'
import { getSavedLookup } from '@/lib/db/saved'
import { isValidCountryFilter } from '@/lib/regions'

export const revalidate = 1800

interface Props {
  searchParams: Promise<{ country?: string }>
}

export default async function XDiscussionsPage({ searchParams }: Props) {
  const params = await searchParams
  const country = params.country && isValidCountryFilter(params.country) ? params.country : undefined

  let discussions: Awaited<ReturnType<typeof getXDiscussions>>['discussions'] = []
  let pageError: string | null = null

  try {
    const data = await getXDiscussions({ country, cutoffDays: 7, limit: 200 })
    discussions = data.discussions
  } catch (err) {
    pageError = err instanceof Error ? err.message : String(err)
  }

  let savedDiscussionIds: string[] = []
  try {
    const saved = await getSavedLookup({ discussionIds: discussions.map((d) => d.id) })
    savedDiscussionIds = saved.discussionIds
  } catch {
    /* non-fatal */
  }
  const savedSet = new Set(savedDiscussionIds)

  return (
      <div className="min-h-screen grain-overlay" style={{ background: 'var(--parchment)' }}>
        <header className="masthead-stripe text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-[0.65rem] font-semibold tracking-[0.22em] uppercase opacity-75 mb-2">
                  Discussions · X
                </p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-2">
                  <span
                    className="inline-flex w-9 h-9 rounded-lg items-center justify-center text-base"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
                    aria-hidden="true"
                  >
                    𝕏
                  </span>
                  Pulse on X
                </h1>
                <p className="text-sm mt-2 text-white/80 max-w-xl">
                  Trending posts and conversations from X about African business and national news — last 7 days.
                </p>
              </div>
              <Link
                href="/"
                className="text-sm underline underline-offset-4 text-white/85 hover:text-white shrink-0"
              >
                Back to digest
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <section className="rounded-2xl border p-4 sm:p-5 frost-panel mb-6" style={{ borderColor: 'var(--rule)' }}>
            <DiscussionTabs active="x" xCount={discussions.length} />
            {country ? (
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                Filtered by country.{' '}
                <Link href="/discussions/x" className="underline">
                  Clear filter
                </Link>
              </p>
            ) : null}
          </section>

          {pageError ? (
            <div
              className="rounded-xl border px-4 py-6 text-sm"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink-soft)' }}
            >
              Could not load X discussions. {pageError}
            </div>
          ) : discussions.length === 0 ? (
            <div
              className="rounded-xl border px-6 py-12 text-center"
              style={{ borderColor: 'var(--rule)', background: 'rgba(255,255,255,0.7)' }}
            >
              <p className="font-display text-lg font-bold mb-2" style={{ color: 'var(--forest)' }}>
                No X discussions yet
              </p>
              <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--ink-soft)' }}>
                Run ingest and process, or check back after the next digest update.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-4" style={{ color: 'var(--ink-soft)' }}>
                {discussions.length} post{discussions.length === 1 ? '' : 's'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {discussions.map((d) => (
                  <DiscussionItem
                    key={d.id}
                    discussion={d}
                    isSaved={savedSet.has(d.id)}
                    variant="x"
                    layout="grid"
                  />
                ))}
              </div>
            </>
          )}
        </main>
    </div>
  )
}
