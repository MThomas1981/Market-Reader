'use client';

import { useEffect, useId, useState } from 'react';
import type { SearchResult } from '@market-reader/core';
import type { LiveStatus } from '@/lib/dashboard';

export function StatusPill({ status, label }: { status: LiveStatus; label?: string }) {
  const text = label ?? { live: 'Live', connecting: 'Connecting…', local: 'Saved in this browser', offline: 'Reconnecting…' }[status];
  const tone = {
    live: 'bg-up-tint text-up',
    connecting: 'bg-fog text-muted',
    local: 'bg-fog text-muted',
    offline: 'bg-down-tint text-down',
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`} role="status">
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'live' ? 'motion-safe:animate-pulse' : ''}`} aria-hidden />
      {text}
    </span>
  );
}

/** Text input with symbol suggestions from /api/search (native datalist, so it works with keyboard and screen readers). */
export function SymbolInput({
  value, onChange, placeholder = 'Symbol, e.g. MSFT', className = '', required = false, id,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; required?: boolean; id?: string }) {
  const listId = useId();
  const [options, setOptions] = useState<SearchResult[]>([]);
  useEffect(() => {
    if (value.trim().length < 1) return setOptions([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(value)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((b) => setOptions(b.results ?? []))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);
  return (
    <>
      <input
        id={id}
        list={listId}
        value={value}
        required={required}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-10 rounded-lg border border-rule bg-paper px-3 text-ink placeholder:text-muted focus:border-accent focus:outline-none ${className}`}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.symbol} value={o.symbol}>{o.name}</option>
        ))}
      </datalist>
    </>
  );
}

export const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? 'text-muted' : v > 0 ? 'text-up' : 'text-down');
