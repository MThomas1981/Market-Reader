'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRegularSessionTime, normalizeSymbol, type Instrument, type Quote } from '@market-reader/core';
import { supabaseBrowser } from './supabase/browser';
import { readWatchlist, writeWatchlist, onWatchlistChange } from './watchlist';
import { useTradeStream, type LiveTrade, type StreamState } from './stream';

/**
 * Data for the dashboard. Signed in: Supabase tables, kept live with Supabase Realtime, so a change
 * made on the phone or in another tab appears here within a second. Signed out: this browser only.
 */

export type LiveStatus = 'connecting' | 'live' | 'local' | 'offline';

/**
 * A quote moved to the price of a newer real-time trade. Only regular-session trades (9:30–4:00 ET)
 * move the main price, matching how exchanges and sites such as Yahoo Finance quote "today";
 * pre-market and after-hours trades are shown separately (see extendedTrade).
 */
export function applyTrade(q: Quote, t: LiveTrade | undefined): Quote {
  if (!t || t.t <= q.timestamp || !isRegularSessionTime(t.t)) return q;
  const change = q.previousClose ? t.p - q.previousClose : q.change + (t.p - q.price);
  const base = q.previousClose ?? q.price - q.change;
  return { ...q, price: t.p, change, changePercent: base ? (change / base) * 100 : q.changePercent, timestamp: t.t, source: 'Finnhub real-time', delayed: false };
}

/** A pre-market or after-hours trade newer than the quote, if there is one. */
export function extendedTrade(q: Quote, t: LiveTrade | undefined): LiveTrade | null {
  return t && t.t > q.timestamp && !isRegularSessionTime(t.t) ? t : null;
}

const streamable = (i: Instrument | undefined) =>
  !!i && i.country === 'US' && (i.assetClass === 'stock' || i.assetClass === 'etf' || i.assetClass === 'index');

/**
 * Prices for a set of symbols. US stocks and ETFs update on every trade through the real-time stream;
 * everything (and US stocks too, as a backstop) is also refreshed every `everyMs`.
 * Remembers the previous price so rows can flash.
 */
export function useLiveQuotes(symbols: string[], everyMs = 10_000) {
  const [polled, setPolled] = useState<Map<string, Quote>>(new Map());
  const [instruments, setInstruments] = useState<Map<string, Instrument>>(new Map());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Map<string, number>>(new Map());
  const shown = useRef<Map<string, number>>(new Map());
  const key = [...symbols].sort().join(',');

  useEffect(() => {
    if (!key) {
      setPolled(new Map());
      return;
    }
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/quotes?symbols=${key.split(',').map(encodeURIComponent).join(',')}`, { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Prices didn’t load.');
        if (!live) return;
        setPolled(new Map((body.quotes as Quote[]).map((q) => [q.symbol, q])));
        setInstruments(new Map((body.instruments as Instrument[]).map((i) => [i.symbol, i])));
        setUpdatedAt(Date.now());
        setError(null);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), everyMs);
    // Coming back to the tab refreshes at once instead of showing old prices until the next tick.
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, everyMs]);

  const usSymbols = useMemo(() => symbols.filter((s) => streamable(instruments.get(s))), [symbols, instruments]);
  const stream = useTradeStream(usSymbols);

  const quotes = useMemo(() => {
    const merged = new Map<string, Quote>();
    for (const [s, q] of polled) merged.set(s, applyTrade(q, stream.trades.get(s)));
    return merged;
  }, [polled, stream.trades]);

  // Previous price per symbol, for the green/red flash when a price moves.
  useEffect(() => {
    setPrevious(new Map(shown.current));
    shown.current = new Map([...quotes.values()].map((q) => [q.symbol, q.price]));
  }, [quotes]);

  const lastTrade = useMemo(() => Math.max(0, ...[...stream.trades.values()].map((t) => t.t)), [stream.trades]);

  return {
    quotes,
    instruments,
    previous,
    updatedAt: lastTrade > (updatedAt ?? 0) ? lastTrade : updatedAt,
    error,
    stream: stream.state as StreamState,
    streamError: stream.error,
  };
}

// ---------- Watchlist ----------

export function useDashboardWatchlist(userId: string | null) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [status, setStatus] = useState<LiveStatus>(userId ? 'connecting' : 'local');
  const [error, setError] = useState<string | null>(null);
  const listId = useRef<number | null>(null);

  const fetchRemote = useCallback(async () => {
    const db = supabaseBrowser();
    const { data, error: err } = await db.from('watchlist_items').select('symbol, position').order('position');
    if (err) return setError(err.message);
    setSymbols((data ?? []).map((r) => r.symbol as string));
  }, []);

  useEffect(() => {
    if (!userId) {
      setSymbols(readWatchlist());
      setStatus('local');
      return onWatchlistChange(setSymbols);
    }
    const db = supabaseBrowser();
    fetchRemote();
    const channel = db
      .channel(`watchlist:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist_items', filter: `user_id=eq.${userId}` }, () => fetchRemote())
      .subscribe((s: string) => setStatus(s === 'SUBSCRIBED' ? 'live' : s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? 'offline' : 'connecting'));
    return () => {
      db.removeChannel(channel);
    };
  }, [userId, fetchRemote]);

  const ensureList = async () => {
    if (listId.current) return listId.current;
    const db = supabaseBrowser();
    const { data } = await db.from('watchlists').select('id').eq('position', 0).maybeSingle();
    if (data) return (listId.current = data.id as number);
    const { data: made, error: err } = await db.from('watchlists').insert({ user_id: userId, name: 'My watchlist', position: 0 }).select('id').single();
    if (err) throw err;
    return (listId.current = made!.id as number);
  };

  const add = async (raw: string) => {
    const symbol = normalizeSymbol(raw);
    if (!symbol || symbols.includes(symbol)) return;
    setError(null);
    if (!userId) return writeWatchlist([...symbols, symbol]);
    setSymbols((s) => [...s, symbol]); // optimistic; realtime confirms
    try {
      const db = supabaseBrowser();
      const id = await ensureList();
      const { error: err } = await db.from('watchlist_items').insert({ watchlist_id: id, user_id: userId, symbol, position: symbols.length });
      if (err) throw err;
      fetch('/api/me/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) }).catch(() => {});
    } catch (e) {
      setSymbols((s) => s.filter((x) => x !== symbol));
      setError((e as Error).message);
    }
  };

  const remove = async (symbol: string) => {
    setError(null);
    if (!userId) return writeWatchlist(symbols.filter((s) => s !== symbol));
    setSymbols((s) => s.filter((x) => x !== symbol));
    const { error: err } = await supabaseBrowser().from('watchlist_items').delete().eq('symbol', symbol);
    if (err) {
      setError(err.message);
      fetchRemote();
    }
  };

  return { symbols, status, error, add, remove };
}

// Portfolio: paper trading lives in ./paper.ts (usePaperPortfolio, useSellStock, useBuyStock).
