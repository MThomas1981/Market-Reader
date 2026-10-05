'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatChange, formatPrice, normalizeSymbol, type Instrument, type Quote } from '@market-reader/core';
import { readWatchlist, onWatchlistChange, syncWatchlist, writeWatchlist } from '@/lib/watchlist';
import { ChangePill, SourceTag, quoteHref } from './bits';

export function WatchlistView() {
  const [list, setList] = useState<string[] | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setList(readWatchlist());
    syncWatchlist();
    return onWatchlistChange((l) => { setList(l); setSaveError(null); }, setSaveError);
  }, []);

  useEffect(() => {
    if (!list || list.length === 0) {
      setQuotes([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/quotes?symbols=${list.map(encodeURIComponent).join(',')}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) {
          setQuotes(data.quotes);
          setInstruments(data.instruments);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Prices didn’t load. They’ll retry in 30 seconds.');
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [list]);

  const add = () => {
    const s = normalizeSymbol(draft);
    if (!s || !list || list.includes(s)) return setDraft('');
    writeWatchlist([...list, s]);
    setDraft('');
  };

  if (!list) return null;
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const names = new Map(instruments.map((i) => [i.symbol, i]));

  return (
    <>
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label htmlFor="add-symbol" className="visually-hidden">Symbol to add</label>
        <input id="add-symbol" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a symbol, e.g. MSFT or ETH" />
        <button type="submit" className="btn">Add</button>
      </form>
      {saveError && <p className="msg-error" role="alert">{saveError} <a href="/pricing" style={{ color: 'var(--accent)' }}>See plans</a></p>}
      <section className="surface">
        {list.length === 0 ? (
          <p className="empty">Your watchlist is empty. Add a symbol above, or use the star on any quote page.</p>
        ) : (
          <table className="qtable">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col" className="num">Price</th>
                <th scope="col" className="num">Change</th>
                <th scope="col" className="num">Today</th>
                <th scope="col"><span className="visually-hidden">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const q = bySymbol.get(s);
                const inst = names.get(s);
                const fx = inst?.assetClass === 'forex';
                return (
                  <tr key={s}>
                    <td>
                      <Link href={quoteHref(s)}>
                        <span className="sym">{s}</span>
                        <span className="nm">{inst?.name ?? ''}</span>
                      </Link>
                    </td>
                    <td className="num">{q ? formatPrice(q.price, q.currency, { forex: fx }) : '…'}</td>
                    <td className={`num ${q && q.change >= 0 ? 'up' : 'down'}`}>{q ? formatChange(q.change, fx ? 4 : Math.abs(q.price) < 1 ? undefined : 2) : ''}</td>
                    <td className="num">{q ? <ChangePill pct={q.changePercent} /> : ''}</td>
                    <td className="num">
                      <button type="button" className="icon-btn" aria-label={`Remove ${s}`} onClick={() => writeWatchlist(list.filter((x) => x !== s))}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="table-foot">
          {error ?? (quotes[0] ? <>Refreshes every 30 seconds. <SourceTag source={quotes.some((q) => q.source === 'Demo data') ? 'Demo data' : 'Live sources'} /></> : 'Loading prices…')}
          {' '}Signed in, your watchlist syncs with the phone app.
        </div>
      </section>
    </>
  );
}
