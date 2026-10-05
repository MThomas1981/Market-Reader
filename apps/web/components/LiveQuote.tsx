'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DEMO_SOURCE, formatChange, formatPercent, formatPrice, newYorkClock, symbolToPath, timeAgo,
  type AssetClass, type MarketStatus, type Quote,
} from '@market-reader/core';
import { SourceTag } from './bits';
import { announcePrice, useTradeStream } from '@/lib/stream';
import { applyTrade, extendedTrade } from '@/lib/dashboard';

const SESSION_LABEL: Record<MarketStatus['session'], string> = {
  regular: 'US market open',
  'pre-market': 'Pre-market trading',
  'after-hours': 'After-hours trading',
  closed: 'US market closed',
};

const isRegularOpenNow = (s: MarketStatus | null) => !s || s.session === 'regular';

const nyTime = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' });

/**
 * The price at the top of a quote page. US stocks and ETFs move on every real-time trade (Finnhub's
 * trade stream, relayed by /api/stream). As a backstop, and for other assets, the quote is also
 * re-fetched: every 5 seconds while US trading is on, every 15 seconds for crypto, less often when
 * the market is shut or the rate only changes daily.
 */
export function LiveQuote({ symbol, initial, assetClass, usListed }: { symbol: string; initial: Quote; assetClass: AssetClass; usListed: boolean }) {
  const [q, setQ] = useState(initial);
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState(Date.now());
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [, tick] = useState(0);
  const last = useRef(initial.price);
  const fx = assetClass === 'forex';
  const demo = q.source === DEMO_SOURCE;
  const stream = useTradeStream(usListed ? [symbol] : []);
  const trade = stream.trades.get(symbol);
  const streaming = usListed && stream.state === 'streaming';
  const tradeAt = useRef(0);
  tradeAt.current = trade?.t ?? 0;

  // Move to each newer real-time trade as it arrives.
  useEffect(() => {
    if (!trade) return;
    setQ((old) => {
      const next = applyTrade(old, trade);
      if (next === old) return old;
      if (next.price !== last.current) {
        setFlash(next.price > last.current ? 'up' : 'down');
        last.current = next.price;
      }
      return next;
    });
    setCheckedAt(Date.now());
  }, [trade]);

  // Pre-market and after-hours trades, shown under the main price the way exchanges quote them.
  const ext = extendedTrade(q, trade);
  const extLabel = ext ? (newYorkClock(ext.t).minutes < 9 * 60 + 30 ? 'Pre-market' : 'After hours') : null;

  // Let the chart below follow the live price.
  useEffect(() => {
    if (!demo) announcePrice({ symbol, price: q.price, time: q.timestamp });
  }, [symbol, q.price, q.timestamp, demo]);

  useEffect(() => {
    if (!usListed) return;
    let alive = true;
    const load = () => fetch('/api/market-status').then((r) => r.json()).then((s) => alive && setStatus(s)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [usListed]);

  const trading = status ? status.session !== 'closed' : true;
  const every = fx ? 300_000 : assetClass === 'crypto' ? 15_000 : usListed && !trading ? 60_000 : streaming ? 15_000 : 5_000;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/quote/${symbolToPath(symbol)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const body = (await r.json()) as { quote: Quote };
        if (!alive) return;
        if (body.quote.timestamp >= tradeAt.current && body.quote.price !== last.current) {
          setFlash(body.quote.price > last.current ? 'up' : 'down');
          last.current = body.quote.price;
        }
        setQ((old) => (body.quote.source !== DEMO_SOURCE && old.timestamp > body.quote.timestamp && old.source !== DEMO_SOURCE ? { ...body.quote, price: old.price, change: old.change, changePercent: old.changePercent, timestamp: old.timestamp, source: old.source } : body.quote));
        setCheckedAt(Date.now());
      } catch {
        /* keep showing the last good price */
      }
    };
    const t = setInterval(load, every);
    document.addEventListener('visibilitychange', load);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(clock); document.removeEventListener('visibilitychange', load); };
  }, [symbol, every]);

  let note: string;
  if (demo) note = 'Live source unavailable right now, so these are made-up prices.';
  else if (fx) note = 'Daily reference rate from the European Central Bank, published around 4 p.m. Central European Time.';
  else if (assetClass === 'crypto') note = `Live · crypto trades around the clock · checked ${timeAgo(checkedAt)}`;
  else if (usListed && status) {
    note = status.session === 'closed'
      ? `${status.holiday ? `${status.holiday}: ` : ''}${SESSION_LABEL.closed} · price is the official close${status.nextChange ? ` · opens ${nyTime(status.nextChange)}` : ''}`
      : `${streaming ? 'Real-time · every trade streamed' : 'Live'} · ${SESSION_LABEL[status.session]} · ${streaming && trade ? `last trade ${timeAgo(trade.t)}` : `checked ${timeAgo(checkedAt)}`}${status.session === 'regular' && status.nextChange ? ` · closes ${nyTime(status.nextChange)}` : ''}`;
  } else note = `Checked ${timeAgo(checkedAt)}`;

  const isLive = !demo && !fx && (assetClass === 'crypto' || !usListed || (status ? status.session !== 'closed' : false));

  return (
    <>
      <div className="quote-price-row">
        <span
          key={`${q.price}-${q.timestamp}`}
          className={`quote-price rounded px-1 ${flash === 'up' ? 'motion-safe:animate-[flash-up_1.2s_ease-out]' : flash === 'down' ? 'motion-safe:animate-[flash-down_1.2s_ease-out]' : ''}`}
        >
          {formatPrice(q.price, q.currency, { forex: fx })}
        </span>
        <span className={`quote-change ${q.change >= 0 ? 'up' : 'down'}`}>
          {formatChange(q.change, fx ? 4 : Math.abs(q.price) < 1 ? undefined : 2)} ({formatPercent(q.changePercent)}) {assetClass === 'crypto' ? 'past 24 hours' : 'today'}
        </span>
      </div>
      {ext && extLabel && (
        <div className="asof" style={{ marginTop: 2 }}>
          <strong>{extLabel}:</strong> {formatPrice(ext.p, q.currency)}{' '}
          <span className={ext.p >= q.price ? 'up' : 'down'}>
            {formatChange(ext.p - q.price, 2)} ({formatPercent(((ext.p - q.price) / q.price) * 100)})
          </span>{' '}
          · {nyTime(ext.t)}
        </div>
      )}
      <div className="asof" aria-live="polite">
        <span className={`live-dot${isLive ? ' on' : ''}`} aria-hidden /> {note}
        <br />
        {usListed && !isRegularOpenNow(status) ? 'At close' : 'Last trade'} {new Date(q.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })}.{' '}
        <SourceTag source={q.source} delayed={q.delayed} />
      </div>
    </>
  );
}
