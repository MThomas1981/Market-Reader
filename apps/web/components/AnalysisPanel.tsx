'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { formatNumber, formatPercent, symbolToPath, type RiskReturn } from '@market-reader/core';

const d = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export function AnalysisPanel({ symbol }: { symbol: string }) {
  const [state, setState] = useState<{ stats?: RiskReturn; benchmark?: string | null; locked?: boolean; error?: string } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setState(null);
    fetch(`/api/analysis/${symbolToPath(symbol)}`, { signal: ctrl.signal, cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json();
        if (r.status === 402) return setState({ locked: true });
        if (!r.ok) throw new Error(body.error ?? 'Analysis didn’t load.');
        setState({ stats: body.stats, benchmark: body.benchmark });
      })
      .catch((e: Error) => e.name !== 'AbortError' && setState({ error: e.message }));
    return () => ctrl.abort();
  }, [symbol]);

  return (
    <section className="stack-section" style={{ marginTop: 28 }} aria-labelledby="analysis-title">
      <h2 className="section-title" id="analysis-title">Deeper analysis, past year</h2>
      {!state && <p className="surface empty">Crunching a year of prices…</p>}
      {state?.error && <p className="surface empty">{state.error}</p>}
      {state?.locked && (
        <div className="surface forecast-locked" style={{ borderTop: 0 }}>
          <span>See risk and return, the deepest drop, best and worst days, and how closely it moves with the S&amp;P 500. Part of Pro.</span>
          <Link href="/pricing" className="btn btn-primary">See Pro</Link>
        </div>
      )}
      {state?.stats && <Stats s={state.stats} benchmark={state.benchmark ?? null} />}
    </section>
  );
}

export function Stats({ s, benchmark }: { s: RiskReturn; benchmark: string | null }) {
  const pct = (v: number | null) => formatPercent(v);
  const cls = (v: number | null) => (v === null ? '' : v >= 0 ? 'up' : 'down');
  const rows: [string, ReactNode, string?][] = [
    ['Return', <span className={cls(s.totalReturnPct)}>{pct(s.totalReturnPct)}</span>, `${d(s.periodStart)} to ${d(s.periodEnd)}`],
    ...(benchmark ? [['Vs. S&P 500', <span className={cls(s.relativeReturnPct)}>{pct(s.relativeReturnPct)}</span>, `S&P 500 (SPY) returned ${pct(s.benchmarkReturnPct)}`] as [string, ReactNode, string]] : []),
    ['Volatility', formatPercent(s.annualVolatilityPct, false), 'Typical yearly swing; higher means bumpier'],
    ['Return per unit of risk', s.sharpe === null ? '—' : formatNumber(s.sharpe, 2), 'Sharpe ratio; above 1 is strong'],
    ['Deepest drop', <span className="down">{pct(s.maxDrawdownPct)}</span>, s.maxDrawdownFrom ? `${d(s.maxDrawdownFrom)} to ${d(s.maxDrawdownTo)}` : ''],
    ['Below its high', pct(s.fromHighPct), `${pct(s.fromLowPct)} above its low`],
    ['Best day', <span className="up">{pct(s.bestDayPct)}</span>, d(s.bestDayDate)],
    ['Worst day', <span className="down">{pct(s.worstDayPct)}</span>, d(s.worstDayDate)],
    ['Up days', formatPercent(s.upDaysPct, false), 'Share of days that closed higher'],
    ...(s.beta !== null ? [['Beta', formatNumber(s.beta, 2), `Moves ${formatNumber(s.beta, 2)}× the S&P 500; correlation ${formatNumber(s.correlation, 2)}`] as [string, ReactNode, string]] : []),
    ['RSI (14 day)', s.rsi14 === null ? '—' : formatNumber(s.rsi14, 0), 'Above 70 often called stretched, below 30 oversold'],
    ['Vs. 50-day average', pct(s.vsSma50Pct)],
    ['Vs. 200-day average', pct(s.vsSma200Pct)],
  ];
  return (
    <div className="surface">
      <table className="qtable analysis">
        <tbody>
          {rows.map(([k, v, note]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td className="num"><strong>{v}</strong></td>
              <td className="muted">{note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
