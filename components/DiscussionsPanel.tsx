import DiscussionItem from './DiscussionItem'
import type { Discussion } from '@/lib/types'

export default function DiscussionsPanel({ discussions }: { discussions: Discussion[] }) {
  return (
    <aside aria-label="What people are discussing">
      <div className="sticky top-[96px] rounded-2xl p-4 frost-panel">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl h-8 w-8 rounded-full border inline-flex items-center justify-center bg-white" style={{ borderColor: 'var(--rule-light)' }} aria-hidden="true">💬</span>
          <h2 className="font-display text-xl font-bold tracking-tight" style={{ color: 'var(--forest)' }}>
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
