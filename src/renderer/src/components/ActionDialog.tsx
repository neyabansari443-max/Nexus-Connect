import { AlertTriangle, ShieldAlert } from 'lucide-react'

type DialogTone = 'warning' | 'danger'

type ActionDialogProps = {
  open: boolean
  tone?: DialogTone
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  showCancel?: boolean
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

export default function ActionDialog({
  open,
  tone = 'warning',
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  showCancel = true,
  onConfirm,
  onCancel,
  busy = false
}: ActionDialogProps) {
  if (!open) {
    return null
  }

  const isDanger = tone === 'danger'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog backdrop"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative w-[min(92vw,32rem)] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl animate-in zoom-in-95 fade-in-50 duration-200">
        <div
          className={`absolute inset-0 pointer-events-none ${
            isDanger
              ? 'bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_45%)]'
              : 'bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.22),transparent_45%)]'
          }`}
        />

        <div className="relative p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 rounded-lg border p-2 ${
                isDanger
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
              }`}
            >
              {isDanger ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-300">{description}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {showCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                isDanger
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
