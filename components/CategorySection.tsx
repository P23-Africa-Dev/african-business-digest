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
}

interface Props {
  category: Category
  stories: Story[]
}

export default function CategorySection({ category, stories }: Props) {
  return (
    <section aria-labelledby={`cat-${category}`} className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl" aria-hidden="true">{CATEGORY_ICONS[category]}</span>
        <h2
          id={`cat-${category}`}
          className="font-display text-xl font-bold tracking-tight"
          style={{ color: 'var(--forest)' }}
        >
          {CATEGORY_LABELS[category]}
        </h2>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full ml-1"
          style={{ background: 'var(--rule-light)', color: 'var(--ink-soft)' }}
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
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      )}
    </section>
  )
}
