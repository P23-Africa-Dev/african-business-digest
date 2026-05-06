export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        <div className="space-y-10">
          {[0, 1, 2].map((s) => (
            <div key={s}>
              <div className="flex items-center gap-2 mb-4">
                <div className="shimmer h-6 w-6 rounded" />
                <div className="shimmer h-6 w-32 rounded" />
              </div>
              <hr className="rule-double mb-4" />
              <div className="grid gap-3">
                {[0, 1, 2].map((c) => (
                  <div key={c} className="bg-white rounded-lg border p-5" style={{ borderColor: 'var(--rule)' }}>
                    <div className="shimmer h-5 w-3/4 rounded mb-3" />
                    <div className="shimmer h-4 w-full rounded mb-2" />
                    <div className="shimmer h-4 w-5/6 rounded mb-4" />
                    <div className="flex gap-2">
                      <div className="shimmer h-5 w-16 rounded-full" />
                      <div className="shimmer h-5 w-10 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="shimmer h-6 w-28 rounded mb-4" />
          <hr className="rule-double mb-4" />
          <div className="space-y-2">
            {[0,1,2,3,4].map((i) => (
              <div key={i} className="bg-white rounded-lg border p-3.5" style={{ borderColor: 'var(--rule)' }}>
                <div className="shimmer h-4 w-full rounded mb-2" />
                <div className="shimmer h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
