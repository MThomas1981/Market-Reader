'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DEMO_SOURCE, formatPercent, formatPrice, timeAgo, symbolToPath } from '@market-reader/core';
import { useDashboardWatchlist, useLiveQuotes } from '@/lib/dashboard';
import { StatusPill, SymbolInput, tone } from './parts';

/** Watchlist that updates itself: rows sync across devices through Supabase Realtime, prices refresh every 15 s. */
export function LiveWatchlist({ userId, limit }: { userId: string | null; limit: number }) {
  const { symbols, status, error, add, remove } = useDashboardWatchlist(userId);
  const { quotes, instruments, previous, updatedAt, error: priceError, stream } = useLiveQuotes(symbols);
  const anyDemo = [...quotes.values()].some((q) => q.source === DEMO_SOURCE);
  const [draft, setDraft] = useState('');

  return (
    <section aria-labelledby="wl-title" className="rounded-[10px] border border-rule bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3">
        <h2 id="wl-title" className="text-[15px] font-semibold">Watchlist</h2>
        <StatusPill status={status} />
      </header>

      <form
        className="flex gap-2 px-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
          setDraft('');
        }}
      >
        <label htmlFor="wl-add" className="sr-only">Add a symbol</label>
        <SymbolInput id="wl-add" value={draft} onChange={setDraft} placeholder="Add a symbol" className="min-w-0 flex-1" />
        <button type="submit" disabled={!draft.trim()} className="h-10 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:brightness-110 disabled:opacity-50">
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mx-4 mt-2 text-sm text-down">
          {error} {/limit|plan/i.test(error) && <Link href="/pricing" className="text-accent underline">See plans</Link>}
        </p>
      )}

      <ul className="mt-2">
        {symbols.length === 0 && <li className="px-4 py-6 text-sm text-muted">Add a symbol to start tracking it here.</li>}
        {symbols.map((s) => {
          const q = quotes.get(s);
          const inst = instruments.get(s);
          const before = previous.get(s);
          const moved = q && before !== undefined && before !== q.price ? (q.price > before ? 'up' : 'down') : null;
          return (
            <li key={s} className="group flex items-center gap-3 border-t border-rule-soft px-4 py-2.5 first:border-t-0">
              <Link href={`/quote/${symbolToPath(s)}`} className="min-w-0 flex-1 hover:text-accent">
                <span className="block font-semibold">
                  {s}
                  {q?.source === DEMO_SOURCE && (
                    <span className="ml-1.5 rounded bg-down-tint px-1 text-[11px] font-semibold text-down" title="The live source didn’t answer, so this price is made up.">Demo</span>
                  )}
                </span>
                <span className="block truncate text-[13px] text-muted">{inst?.name ?? ''}</span>
              </Link>
              <span
                key={`${s}-${q?.price}`}
                className={`rounded px-1.5 tabular-nums ${moved === 'up' ? 'motion-safe:animate-[flash-up_1.2s_ease-out]' : moved === 'down' ? 'motion-safe:animate-[flash-down_1.2s_ease-out]' : ''}`}
              >
                {q ? formatPrice(q.price, q.currency, { forex: inst?.assetClass === 'forex' }) : '…'}
              </span>
              <span className={`w-[72px] text-right text-sm font-semibold tabular-nums ${tone(q?.changePercent)}`}>
                {q ? formatPercent(q.changePercent) : ''}
              </span>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Remove ${s}`}
                className="rounded px-1.5 text-muted opacity-60 hover:bg-down-tint hover:text-down group-hover:opacity-100 focus:opacity-100"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="border-t border-rule-soft px-4 py-2 text-xs text-muted">
        {priceError ??
          (updatedAt
            ? stream === 'streaming'
              ? `US stocks stream every trade in real time; last update ${timeAgo(updatedAt)}. Crypto and currencies refresh every 10 seconds.`
              : `Prices updated ${timeAgo(updatedAt)}, refreshing every 10 seconds.`
            : 'Loading prices…')}
        {anyDemo && ' Rows marked Demo are made-up prices because the live source didn’t answer.'}
        {userId ? ` ${symbols.length} of ${limit} symbols.` : ' Sign in to sync with your phone.'}
      </footer>
    </section>
  );
}
