import StoryCard from './StoryCard'
import type { Story, Category } from '@/lib/types'
import { CATEGORY_LABELS } from '@/lib/types'

const CATEGORY_ICONS: Record<Category, string> = {
  fintech: '₿',
  logistics: '🚚',
  energy: '⚡',
  retail: '🛍',
  deals_funding: '💰',
  policy: '⚖',
  business_failures: '📉',
  agriculture: '🌾',
  infrastructure: '🏗',
  consumer_markets: '🛒',
  society: '🏛',
  trending: '🔥',
}

interface Props {
  category: Category
  stories: Story[]
  savedStoryIds?: string[]
}

export default function CategorySection({ category, stories, savedStoryIds = [] }: Props) {
  const savedSet = new Set(savedStoryIds)
  return (
    <section aria-labelledby={`cat-${category}`} className="mb-11">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-xl h-8 w-8 rounded-full border inline-flex items-center justify-center bg-white" style={{ borderColor: 'var(--rule-light)' }} aria-hidden="true">{CATEGORY_ICONS[category]}</span>
        <h2
          id={`cat-${category}`}
          className="font-display text-xl sm:text-2xl font-bold tracking-tight"
          style={{ color: 'var(--forest)' }}
        >
          {CATEGORY_LABELS[category]}
        </h2>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full ml-1"
          style={{ background: 'var(--emerald-fade)', color: 'var(--forest-mid)' }}
        >
          {stories.length}
        </span>
      </div>
      <hr className="rule-double mb-4" />

      {stories.length === 0 ? (
        <p className="text-sm italic py-4" style={{ color: 'var(--fading-text)' }}>
          No new {CATEGORY_LABELS[category].toLowerCase()} stories today.
        </p>
      ) : (
        <div className="grid gap-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} isSaved={savedSet.has(story.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
