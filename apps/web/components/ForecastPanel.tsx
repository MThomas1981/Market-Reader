'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatPercent, formatPrice, symbolToPath, type CagrRating as Rating, type ForecastPoint, type Horizon, type BacktestResult } from '@market-reader/core';
import { CagrRating, type TrendInputs } from './CagrRating';

interface Forecast {
  plan: string; lastPrice: number; lastDate: string; annualVolatility: number; sampleSize: number; source: string;
  points: ForecastPoint[]; locked: Horizon[]; accuracy: BacktestResult[] | null; error?: string;
  cagr?: Rating; trend?: TrendInputs;
}

const LABEL: Record<Horizon, string> = { '1D': '1 day', '1W': '1 week', '1M': '1 month', '3M': '3 months', '6M': '6 months' };

export function ForecastPanel({ symbol, currency, forex }: { symbol: string; currency: string; forex: boolean }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/forecast/${symbolToPath(symbol)}`, { signal: ctrl.signal, cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? 'Estimates didn’t load.');
        setData(body);
      })
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [symbol]);

  const price = (v: number) => formatPrice(v, currency, { forex });

  return (
    <section className="stack-section" style={{ marginTop: 28 }} aria-labelledby="forecast-title">
      <h2 className="section-title" id="forecast-title">Where the price could be</h2>
      <div className="surface forecast">
        {error && <p className="empty">{error}</p>}
        {!data && !error && <p className="empty">Estimating ranges…</p>}
        {data?.cagr && <CagrRating cagr={data.cagr} trend={data.trend} />}
        {data && <Ladder data={data} price={price} />}
        {data && data.locked.length > 0 && (
          <div className="forecast-locked">
            <span>
              {data.locked.map((h) => LABEL[h]).join(', ')} estimates, with a record of how accurate past estimates were, are part of Pro.
            </span>
            <Link href="/pricing" className="btn btn-primary">See Pro</Link>
          </div>
        )}
        {data?.accuracy && data.accuracy.length > 0 && (
          <div className="forecast-accuracy">
            <strong>Track record over the past year.</strong> How often the real price ended inside the wide range when this
            method was replayed on past prices (about 80% is right on target):{' '}
            {data.accuracy.map((a, i) => (
              <span key={a.horizon}>{i > 0 && ', '}{LABEL[a.horizon]} {Math.round(a.wideHitRate * 100)}%</span>
            ))}.
          </div>
        )}
        {data && (
          <p className="forecast-note">
            These are statistical ranges from the past year of price swings ({formatPercent(data.annualVolatility * 100, false)} yearly volatility), with the
            trend anchored on the long-run CAGR above, not predictions. News, earnings and events can push prices outside them. Not financial advice.
          </p>
        )}
      </div>
    </section>
  );
}

/** Range ladder: one row per horizon. Thin bar = wide range (80% likely), thick bar = likely range (50%), dot = middle estimate. */
export function Ladder({ data, price }: { data: Forecast; price: (v: number) => string }) {
  const pts = data.points;
  const lo = Math.min(data.lastPrice, ...pts.map((p) => p.wideLow));
  const hi = Math.max(data.lastPrice, ...pts.map((p) => p.wideHigh));
  const pad = (hi - lo) * 0.04;
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  const now = x(data.lastPrice);

  return (
    <div className="ladder" role="table" aria-label="Estimated price ranges">
      <div className="ladder-row ladder-head" role="row">
        <span role="columnheader">By</span>
        <span role="columnheader" className="ladder-track-head">
          <span style={{ left: `${now}%` }}>Now {price(data.lastPrice)}</span>
        </span>
        <span role="columnheader" className="num">Likely range</span>
        <span role="columnheader" className="num">Chance higher</span>
      </div>
      {pts.map((p) => (
        <div className="ladder-row" role="row" key={p.horizon}>
          <span role="cell">
            <strong>{LABEL[p.horizon]}</strong>
            <span className="muted ladder-date">{new Date(`${p.targetDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </span>
          <span role="cell" className="ladder-track" title={`Wide range ${price(p.wideLow)} to ${price(p.wideHigh)}`}>
            <span className="ladder-now" style={{ left: `${now}%` }} aria-hidden />
            <span className="ladder-wide" style={{ left: `${x(p.wideLow)}%`, width: `${x(p.wideHigh) - x(p.wideLow)}%` }} aria-hidden />
            <span className="ladder-likely" style={{ left: `${x(p.likelyLow)}%`, width: `${x(p.likelyHigh) - x(p.likelyLow)}%` }} aria-hidden />
            <span className="ladder-mid" style={{ left: `${x(p.median)}%` }} aria-hidden />
          </span>
          <span role="cell" className="num">{price(p.likelyLow)} – {price(p.likelyHigh)}</span>
          <span role="cell" className="num">{Math.round(p.probUp * 100)}%</span>
        </div>
      ))}
      <div className="ladder-key" aria-hidden>
        <span><i className="k-likely" /> Likely range (50% chance)</span>
        <span><i className="k-wide" /> Wide range (80% chance)</span>
        <span><i className="k-mid" /> Middle estimate</span>
      </div>
    </div>
  );
}
