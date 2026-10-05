'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatPrice } from '@market-reader/core';
import { ChangePill, quoteHref } from './bits';

interface Item {
  symbol: string; name: string; firstSeenAt: string; lastSeenAt: string; views: number; saved: boolean;
  firstPrice: number | null; price: number | null; currency: string; changeSinceFirstPct: number | null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function HistoryView() {
  const [state, setState] = useState<{ items?: Item[]; plan?: string; signedOut?: boolean; error?: string } | null>(null);
  const [sort, setSort] = useState<'recent' | 'best' | 'worst'>('recent');

  useEffect(() => {
    fetch('/api/me/history', { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json();
        if (r.status === 401) return setState({ signedOut: true });
        if (!r.ok) throw new Error(body.error);
        setState({ items: body.items, plan: body.plan });
      })
      .catch((e: Error) => setState({ error: e.message || 'Your history didn’t load.' }));
  }, []);

  if (!state) return <p className="surface empty">Loading your history…</p>;
  if (state.signedOut) {
    return (
      <p className="surface empty">
        <Link href="/auth/sign-in?next=/history" style={{ color: 'var(--accent)' }}>Sign in</Link> to keep a record of the stocks you look at. Free accounts keep the last 10; Pro keeps everything.
      </p>
    );
  }
  if (state.error) return <p className="surface empty">{state.error}</p>;

  const items = [...(state.items ?? [])].sort((a, b) =>
    sort === 'recent' ? b.lastSeenAt.localeCompare(a.lastSeenAt)
      : sort === 'best' ? (b.changeSinceFirstPct ?? -1e9) - (a.changeSinceFirstPct ?? -1e9)
        : (a.changeSinceFirstPct ?? 1e9) - (b.changeSinceFirstPct ?? 1e9),
  );

  return (
    <>
      <div className="segmented" role="group" aria-label="Sort" style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>Most recent</button>
        <button type="button" aria-pressed={sort === 'best'} onClick={() => setSort('best')}>Best since</button>
        <button type="button" aria-pressed={sort === 'worst'} onClick={() => setSort('worst')}>Worst since</button>
      </div>
      <section className="surface">
        {items.length === 0 ? (
          <p className="empty">Nothing yet. Open any stock and it will appear here.</p>
        ) : (
          <table className="qtable">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">First looked</th>
                <th scope="col" className="num">Price then</th>
                <th scope="col" className="num">Price now</th>
                <th scope="col" className="num">Since then</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.symbol}>
                  <td>
                    <Link href={quoteHref(it.symbol)}>
                      <span className="sym">{it.symbol}{it.saved ? ' ★' : ''}</span>
                      <span className="nm">{it.name}</span>
                    </Link>
                  </td>
                  <td>{day(it.firstSeenAt)}<span className="nm">Viewed {it.views} time{it.views === 1 ? '' : 's'}</span></td>
                  <td className="num">{formatPrice(it.firstPrice, it.currency)}</td>
                  <td className="num">{formatPrice(it.price, it.currency)}</td>
                  <td className="num">{it.changeSinceFirstPct === null ? '—' : <ChangePill pct={it.changeSinceFirstPct} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {state.plan !== 'pro' && (
          <div className="table-foot">
            The Free plan keeps your 10 most recent stocks. <Link href="/pricing" style={{ color: 'var(--accent)' }}>Pro keeps everything</Link>.
          </div>
        )}
      </section>
    </>
  );
}
