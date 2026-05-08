import Link from 'next/link'
import { getSavedItems } from '@/lib/db/saved'
import { CATEGORIES, CATEGORY_LABELS, COUNTRIES, COUNTRY_LABELS } from '@/lib/types'
import CategorySection from '@/components/CategorySection'
import DiscussionItem from '@/components/DiscussionItem'

interface Props {
  searchParams: Promise<{ type?: 'all' | 'story' | 'discussion'; category?: string; country?: string }>
}

export default async function SavedPage({ searchParams }: Props) {
  const params = await searchParams
  const type = params.type ?? 'all'
  const category = params.category
  const country = params.country

  let stories: Awaited<ReturnType<typeof getSavedItems>>['stories'] = []
  let discussions: Awaited<ReturnType<typeof getSavedItems>>['discussions'] = []
  let pageError: string | null = null
  try {
    const data = await getSavedItems({ type, category, country })
    stories = data.stories
    discussions = data.discussions
  } catch (err) {
    pageError = err instanceof Error ? err.message : String(err)
  }
  const savedStoryIds = stories.map((s) => s.id)
  const savedDiscussionIds = discussions.map((d) => d.id)

  const byCategory = CATEGORIES.reduce<Record<string, typeof stories>>((acc, cat) => {
    acc[cat] = stories.filter((s) => s.category === cat)
    return acc
  }, {})

  return (
    <div className="min-h-screen grain-overlay" style={{ background: 'var(--parchment)' }}>
      <header className="masthead-stripe text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold tracking-[0.22em] uppercase opacity-75 mb-2">Briefcase</p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight">Saved Items</h1>
            </div>
            <Link href="/" className="text-sm underline underline-offset-4 text-white/85 hover:text-white">
              Back to digest
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {pageError && (
          <div className="mb-5 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--rule)', color: 'var(--ink-soft)' }}>
            Saved items are not available yet. {pageError}
          </div>
        )}
        <section className="rounded-xl border p-4 mb-6 frost-panel" style={{ borderColor: 'var(--rule)' }}>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { key: 'all', label: 'All' },
              { key: 'story', label: 'Stories' },
              { key: 'discussion', label: 'Discussions' },
            ].map((tab) => {
              const url = new URLSearchParams()
              url.set('type', tab.key)
              if (category) url.set('category', category)
              if (country) url.set('country', country)
              const active = type === tab.key
              return (
                <Link
                  key={tab.key}
                  href={`/saved?${url.toString()}`}
                  className="rounded-full px-3 py-1 text-xs font-semibold border"
                  style={
                    active
                      ? { background: 'var(--forest)', color: 'white', borderColor: 'var(--forest)' }
                      : { borderColor: 'var(--rule)', color: 'var(--ink-mid)' }
                  }
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold self-center" style={{ color: 'var(--ink-soft)' }}>
              Category
            </span>
            <FilterLink baseType={type} label="All" keyName="category" value={null} active={!category} country={country} />
            {CATEGORIES.map((cat) => (
              <FilterLink
                key={cat}
                baseType={type}
                label={CATEGORY_LABELS[cat]}
                keyName="category"
                value={cat}
                active={category === cat}
                country={country}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs font-semibold self-center" style={{ color: 'var(--ink-soft)' }}>
              Country
            </span>
            <FilterLink baseType={type} label="All" keyName="country" value={null} active={!country} category={category} />
            {COUNTRIES.map((c) => (
              <FilterLink
                key={c}
                baseType={type}
                label={COUNTRY_LABELS[c]}
                keyName="country"
                value={c}
                active={country === c}
                category={category}
              />
            ))}
          </div>
        </section>

        {(type === 'all' || type === 'story') && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-2xl font-bold" style={{ color: 'var(--forest)' }}>
                Saved Stories
              </h2>
              <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                {stories.length}
              </span>
            </div>
            {stories.length === 0 ? (
              <p className="text-sm italic" style={{ color: 'var(--fading-text)' }}>
                No saved stories yet.
              </p>
            ) : (
              CATEGORIES.map((cat) => (
                <CategorySection
                  key={cat}
                  category={cat}
                  stories={byCategory[cat] ?? []}
                  savedStoryIds={savedStoryIds}
                />
              ))
            )}
          </section>
        )}

        {(type === 'all' || type === 'discussion') && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-2xl font-bold" style={{ color: 'var(--forest)' }}>
                Saved Discussions
              </h2>
              <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                {discussions.length}
              </span>
            </div>
            {discussions.length === 0 ? (
              <p className="text-sm italic" style={{ color: 'var(--fading-text)' }}>
                No saved discussions yet.
              </p>
            ) : (
              <div className="grid gap-2">
                {discussions.map((d) => (
                  <DiscussionItem key={d.id} discussion={d} isSaved={savedDiscussionIds.includes(d.id)} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function FilterLink({
  baseType,
  label,
  keyName,
  value,
  active,
  category,
  country,
}: {
  baseType: 'all' | 'story' | 'discussion'
  label: string
  keyName: 'category' | 'country'
  value: string | null
  active: boolean
  category?: string
  country?: string
}) {
  const qs = new URLSearchParams()
  qs.set('type', baseType)
  if (keyName !== 'category' && category) qs.set('category', category)
  if (keyName !== 'country' && country) qs.set('country', country)
  if (value) qs.set(keyName, value)
  return (
    <Link
      href={`/saved?${qs.toString()}`}
      className="rounded-full px-2.5 py-1 text-xs border"
      style={
        active
          ? { background: 'var(--amber)', color: 'white', borderColor: 'var(--amber)' }
          : { borderColor: 'var(--rule)', color: 'var(--ink-mid)' }
      }
    >
      {label}
    </Link>
  )
}
