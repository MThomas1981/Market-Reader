'use client';

import { useEffect, useState } from 'react';

export interface LiveTrade {
  s: string;
  p: number;
  t: number;
  v: number;
}
/** streaming: real-time trades arriving · connecting: setting up · off: not available, prices refresh on a timer instead */
export type StreamState = 'connecting' | 'streaming' | 'off';

/**
 * Real-time trades for US stocks and ETFs from /api/stream (Finnhub's trade feed relayed by the server).
 * Returns the newest trade per symbol. The browser reconnects automatically if the connection drops.
 */
export function useTradeStream(symbols: string[]) {
  const [trades, setTrades] = useState<Map<string, LiveTrade>>(new Map());
  const [state, setState] = useState<StreamState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const key = [...new Set(symbols)].sort().join(',');

  useEffect(() => {
    if (!key || typeof EventSource === 'undefined') {
      setState('off');
      return;
    }
    setState('connecting');
    const es = new EventSource(`/api/stream?symbols=${key.split(',').map(encodeURIComponent).join(',')}`);
    es.addEventListener('ready', () => setState('streaming'));
    es.addEventListener('trades', (e) => {
      const batch = JSON.parse((e as MessageEvent).data) as LiveTrade[];
      setTrades((old) => {
        const next = new Map(old);
        for (const t of batch) {
          const prev = next.get(t.s);
          if (!prev || t.t >= prev.t) next.set(t.s, t);
        }
        return next;
      });
    });
    es.addEventListener('status', (e) => {
      const s = JSON.parse((e as MessageEvent).data) as { state: string; error: string | null };
      setError(s.error);
      setState(s.state === 'open' ? 'streaming' : 'connecting');
    });
    es.onerror = () => {
      // 204 (no key) or a server without streaming closes the source for good; otherwise it retries.
      if (es.readyState === EventSource.CLOSED) setState('off');
      else setState('connecting');
    };
    return () => es.close();
  }, [key]);

  return { trades, state, error };
}

/** Lets the chart follow the live price shown above it. */
export const PRICE_EVENT = 'market-reader:price';
export type PriceEventDetail = { symbol: string; price: number; time: number };
export function announcePrice(detail: PriceEventDetail) {
  window.dispatchEvent(new CustomEvent<PriceEventDetail>(PRICE_EVENT, { detail }));
}
