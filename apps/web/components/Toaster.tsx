'use client';

import { dismissToast, useToasts } from '@/lib/toast';

export function Toaster() {
  const toasts = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-3 rounded-[10px] border bg-paper px-4 py-3 text-sm shadow-lg motion-safe:animate-[drawer-in_160ms_ease-out] ${
            t.tone === 'error' ? 'border-down' : t.tone === 'success' ? 'border-up' : 'border-rule'
          }`}
        >
          <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.tone === 'error' ? 'bg-down' : t.tone === 'success' ? 'bg-up' : 'bg-accent'}`} />
          <div className="min-w-0 flex-1">
            <div className={`font-semibold ${t.tone === 'error' ? 'text-down' : 'text-ink'}`}>{t.title}</div>
            {t.body && <div className="mt-0.5 text-muted">{t.body}</div>}
          </div>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="rounded px-1 text-muted hover:text-ink">✕</button>
        </div>
      ))}
    </div>
  );
}
