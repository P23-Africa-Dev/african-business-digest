import { Suspense } from 'react'
import { getDigest } from '@/lib/db/queries'
import { getSavedLookup } from '@/lib/db/saved'
import { CATEGORIES } from '@/lib/types'
import type { Category } from '@/lib/types'
import FilterBar from '@/components/FilterBar'
import CategorySection from '@/components/CategorySection'
import DiscussionsPanel from '@/components/DiscussionsPanel'
import RunDigestButton from '@/components/RunDigestButton'

export const revalidate = 1800 // 30 min

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
    timeZoneName: 'short',
  })
}

interface Props {
  searchParams: Promise<{ category?: string; country?: string }>
}

export default async function DigestPage({ searchParams }: Props) {
  const params = await searchParams
  const { category, country } = params

  let digest
  
  try {
    digest = await getDigest({
      category,
      country,
    })
  } catch (err) {
    console.error('[DigestPage] Failed to load digest', {
      params,
      error: err instanceof Error ? err.message : String(err),
    })
    digest = { stories: [], discussions: [], lastUpdated: null, storyCount: 0 }
  }

  const {
    stories,
    discussions,
    lastUpdated,
    effectiveMinRelevance,
    fallbackTier,
    usedCountryFallback,
  } = digest

  // Group stories by category
  const byCategory = CATEGORIES.reduce<Record<Category, typeof stories>>(
    (acc, cat) => {
      acc[cat] = stories.filter((s) => s.category === cat)
      return acc
    },
    {} as Record<Category, typeof stories>
  )

  // Sort: categories with stories first
  const orderedCategories = CATEGORIES.slice().sort((a, b) => {
    const diff = (byCategory[b]?.length ?? 0) - (byCategory[a]?.length ?? 0)
    return diff
  })

  const hasStories = stories.length > 0
  const hasDiscussions = discussions.length > 0
  const activeCategoriesCount = orderedCategories.filter((cat) => (byCategory[cat]?.length ?? 0) > 0).length
  let savedStoryIds: string[] = []
  let savedDiscussionIds: string[] = []
  try {
    const savedLookup = await getSavedLookup({
      storyIds: stories.map((s) => s.id),
      discussionIds: discussions.map((d) => d.id),
    })
    savedStoryIds = savedLookup.storyIds
    savedDiscussionIds = savedLookup.discussionIds
  } catch (err) {
    console.warn('[DigestPage] Failed to load saved lookup', err)
  }

  console.log('[DigestPage] Render digest', {
    params,
    counts: { stories: stories.length, discussions: discussions.length },
    lastUpdated,
    hasStories,
    hasDiscussions,
    orderedCategories,
  })

  return (
    <div className="min-h-screen grain-overlay" style={{ background: 'var(--parchment)' }}>
      {/* Masthead */}
      <header className="masthead-stripe text-white relative overflow-hidden">
        <div className="absolute inset-x-0 -bottom-20 h-44 bg-gradient-to-t from-black/20 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold tracking-[0.22em] uppercase opacity-75 mb-2">
                Africa · Business · Intelligence
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight drop-shadow-sm">
                African Business Daily
              </h1>
              <p className="text-sm mt-2.5 max-w-xl text-white/80">
                Signal over noise: the continent&apos;s most discussed business moves, mapped by sector and momentum.
              </p>
            </div>
            <div className="text-right rounded-xl p-3.5 border bg-black/20 backdrop-blur-sm" style={{ borderColor: 'rgba(255,255,255,0.24)' }}>
              <p className="font-display text-sm text-white/85">{formatDate(new Date())}</p>
              {lastUpdated && (
                <p className="text-xs text-white/70 mt-0.5">
                  Updated {formatTime(lastUpdated)}
                </p>
              )}
              <RunDigestButton />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <KpiCard label="Stories" value={stories.length} />
            <KpiCard label="Live Discussions" value={discussions.length} />
            <KpiCard label="Active Sectors" value={activeCategoriesCount} />
            <KpiCard label="Topical Breadth" value={`${Math.max(1, Math.min(100, stories.length * 3))}%`} />
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <Suspense>
        <FilterBar />
      </Suspense>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          {/* Stories */}
          <div>
            {hasStories ? (
              <>
                {(fallbackTier && fallbackTier > 1) || usedCountryFallback ? (
                  <div
                    className="mb-5 rounded-xl border px-3.5 py-2.5 text-xs frost-panel"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    Showing best available matches
                    {effectiveMinRelevance ? ` (relevance >= ${effectiveMinRelevance})` : ''}.
                    {usedCountryFallback
                      ? ' Includes Rest of Africa context due to sparse country-specific stories.'
                      : ''}
                  </div>
                ) : null}
                {orderedCategories.map((cat) => (
                  <CategorySection
                    key={cat}
                    category={cat}
                    stories={byCategory[cat] ?? []}
                    savedStoryIds={savedStoryIds}
                  />
                ))}
              </>
            ) : (
              <NoTrendingStoriesState
                effectiveMinRelevance={effectiveMinRelevance ?? 10}
                usedCountryFallback={Boolean(usedCountryFallback)}
              />
            )}
          </div>

          {/* Discussions — desktop sidebar */}
          <div className="hidden lg:block">
            <DiscussionsPanel discussions={discussions} savedDiscussionIds={savedDiscussionIds} />
          </div>
        </div>

        {/* Discussions — mobile (below stories) */}
        {hasDiscussions ? (
          <div className="lg:hidden mt-10">
            <DiscussionsPanel discussions={discussions} savedDiscussionIds={savedDiscussionIds} />
          </div>
        ) : null}

      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8" style={{ borderColor: 'var(--rule)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row gap-4 items-center justify-between text-xs" style={{ color: 'var(--ink-soft)' }}>
          <div>
            <span className="font-medium" style={{ color: 'var(--forest)' }}>African Business Daily</span>
            {' '}— Aggregated from TechCabal, Disrupt Africa, BusinessDay, Ventures Africa, and more.
          </div>
          <div className="flex items-center gap-4">
            <a href="/saved" className="hover:underline">Saved</a>
            <span>·</span>
            <a href="/api/health" className="hover:underline">Status</a>
            <span>·</span>
            <span>Ingest + full digest once daily at 06:00 UTC</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border px-3 py-2.5 bg-white/10 backdrop-blur-sm" style={{ borderColor: 'rgba(255,255,255,0.25)' }}>
      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-white/75">{label}</p>
      <p className="font-display text-lg text-white">{value}</p>
    </div>
  )
}

function NoTrendingStoriesState({
  effectiveMinRelevance,
  usedCountryFallback,
}: {
  effectiveMinRelevance: number
  usedCountryFallback: boolean
}) {
  return (
    <section
      className="rounded-xl border p-6"
      style={{ borderColor: 'var(--rule)', background: 'rgba(255,255,255,0.7)' }}
    >
      <h2 className="font-display text-xl font-bold mb-2" style={{ color: 'var(--forest)' }}>
        No trending stories for this filter right now
      </h2>
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        We checked relevance thresholds 30, 20, and 10, then tried regional context.
        {` Best available floor: ${effectiveMinRelevance}.`}
        {usedCountryFallback
          ? ' Rest of Africa fallback was also applied.'
          : ' Try widening filters or selecting a broader country scope.'}
      </p>
    </section>
  )
}

