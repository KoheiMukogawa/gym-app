import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastAction = { label: string; onClick: () => void }
type Toast = { id: number; message: string; action?: ToastAction }

const ToastContext = createContext<{ show: (message: string, action?: ToastAction) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((message: string, action?: ToastAction) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, action }])
    // 再試行ボタンを押す時間を確保するため、やや長めに表示する
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg"
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                  t.action?.onClick()
                }}
                className="shrink-0 font-semibold text-accent"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
