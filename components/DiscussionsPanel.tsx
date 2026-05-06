import DiscussionItem from './DiscussionItem'
import type { Discussion } from '@/lib/types'

export default function DiscussionsPanel({ discussions }: { discussions: Discussion[] }) {
  return (
    <aside aria-label="What people are discussing">
      <div className="sticky top-[89px]">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl" aria-hidden="true">💬</span>
          <h2 className="font-display text-xl font-bold" style={{ color: 'var(--forest)' }}>
            Discussions
          </h2>
        </div>
        <hr className="rule-double mb-4" />

        {discussions.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--fading-text)' }}>
            No notable discussions today.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {discussions.map((d) => (
              <DiscussionItem key={d.id} discussion={d} />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
