'use client'

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmActionModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close modal backdrop"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-xl border p-5 shadow-xl"
        style={{ background: 'var(--parchment)', borderColor: 'var(--rule)' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className="font-display text-xl font-bold" style={{ color: 'var(--forest)' }}>
          {title}
        </h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink-mid)' }}
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: 'var(--forest)' }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
