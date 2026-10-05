'use client';

import { useEffect, useState } from 'react';
import { LOOKBACK_BUCKETS, lookbackBucket, symbolToPath, type History, type Range } from '@market-reader/core';

/** Responses kept for this browser tab, so switching ranges or toggling lines doesn't refetch. */
const cache = new Map<string, { at: number; data: History }>();
const maxAge = (range: Range) => (range === '1D' || range === '5D' ? 60_000 : 5 * 60_000);

/** A cached response with at least `bucket` bars of lookback (a bigger buffer serves a smaller need). */
function cached(symbol: string, range: Range, bucket: number): History | null {
  for (const b of LOOKBACK_BUCKETS) {
    if (b < bucket) continue;
    const hit = cache.get(`${symbol}|${range}|${b}`);
    if (hit && Date.now() - hit.at < maxAge(range)) return hit.data;
  }
  return null;
}

/**
 * Chart history for a symbol and range, with `lookback` extra bars before the visible range for
 * indicator warm-up. While a bigger buffer loads, the previous series for the same symbol and range
 * stays on screen.
 */
export function useHistory(symbol: string, range: Range, lookback: number) {
  const bucket = lookbackBucket(lookback);
  const [state, setState] = useState<{ key: string; data: History | null; error: string | null; loading: boolean }>({
    key: '', data: null, error: null, loading: true,
  });

  useEffect(() => {
    const series = `${symbol}|${range}`;
    const hit = cached(symbol, range, bucket);
    if (hit) {
      setState({ key: series, data: hit, error: null, loading: false });
      return;
    }
    // Keep showing the same series while more buffer loads; clear it when the symbol or range changed.
    setState((s) => ({ key: series, data: s.key === series ? s.data : null, error: null, loading: true }));
    const ctrl = new AbortController();
    fetch(`/api/history/${symbolToPath(symbol)}?range=${range}&lookback=${bucket}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? 'Could not load price history.');
        cache.set(`${series}|${bucket}`, { at: Date.now(), data: body as History });
        setState({ key: series, data: body as History, error: null, loading: false });
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setState({ key: series, data: null, error: e.message, loading: false });
      });
    return () => ctrl.abort();
  }, [symbol, range, bucket]);

  return { data: state.data, error: state.error, loading: state.loading };
}
