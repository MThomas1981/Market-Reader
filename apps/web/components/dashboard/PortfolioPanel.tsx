'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  formatNumber, formatPercent, formatPrice, normalizeSymbol, PAPER_STARTING_CASH, symbolToPath, valuePaperPortfolio, type PaperRow,
} from '@market-reader/core';
import { useLiveQuotes } from '@/lib/dashboard';
import { PaperProvider, useBuyStock, usePaperPortfolio, useSellStock } from '@/lib/paper';
import { StatusPill, SymbolInput, tone } from './parts';

/** Share prices: decimals follow the size of the price (crypto under $1 keeps 4). */
const usd = (v: number | null) => formatPrice(v, 'USD');
/** Money amounts (cash, value, P&L): always dollars and cents. */
const money = (v: number | null) => (v === null ? '—' : `$${formatNumber(v, 2)}`);
/** Rounds to cents (or hundredths of a percent) so float dust like -0.000001 shows as 0, not −0.00 in red. */
const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100 || 0);
const signedUsd = (raw: number | null) => {
  const v = r2(raw);
  return v === null ? '—' : `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
};
const pct = (v: number | null) => formatPercent(r2(v));
const toneOf = (v: number | null) => tone(r2(v));
const qty = (n: number) => formatNumber(n, n % 1 ? 4 : 0);
const field = 'h-10 w-full min-w-0 rounded-lg border border-rule bg-paper px-3 text-sm text-ink focus:border-accent focus:outline-none';

/** Paper trading: simulated cash and orders at live prices. Synced across devices when signed in. */
export function PortfolioPanel({ userId }: { userId: string | null }) {
  return (
    <PaperProvider userId={userId}>
      <PaperTrading />
    </PaperProvider>
  );
}

function PaperTrading() {
  const { portfolio, status, loading, error, guest } = usePaperPortfolio();
  const [ticketSymbol, setTicketSymbol] = useState('');
  const symbols = useMemo(() => {
    const s = new Set(portfolio.holdings.map((h) => h.ticker));
    if (ticketSymbol) s.add(ticketSymbol);
    return [...s];
  }, [portfolio.holdings, ticketSymbol]);
  const { quotes } = useLiveQuotes(symbols, 5_000);
  const value = useMemo(
    () => valuePaperPortfolio(portfolio, new Map([...quotes.values()].map((q) => [q.symbol, { price: q.price, change: q.change }]))),
    [portfolio, quotes],
  );
  const priceOf = (t: string) => quotes.get(t)?.price ?? null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <p className="rounded-[10px] border border-rule bg-fog px-4 py-2.5 text-sm text-muted">
        <strong className="text-ink">Paper trading.</strong> Simulated money only: every portfolio starts with {money(PAPER_STARTING_CASH)} of paper cash and
        orders fill at the live price. Nothing is ever sent to a broker. {guest ? 'Saved in this browser.' : 'Saved to your account.'}
      </p>

      <section aria-label="Portfolio summary" className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-rule bg-paper md:grid-cols-4">
        <Figure label="Total value" value={money(value.totalValue)} sub={`${signedUsd(value.totalReturn)} (${pct(value.totalReturnPct)})`} cls={toneOf(value.totalReturn)} />
        <Figure label="Cash" value={money(value.cash)} sub={`Today ${signedUsd(value.dayChange)}`} subCls={toneOf(value.dayChange)} />
        <Figure label="Unrealized P&L" value={signedUsd(value.unrealizedPnl)} cls={toneOf(value.unrealizedPnl)} />
        <Figure label="Realized P&L" value={signedUsd(value.realizedPnl)} cls={toneOf(value.realizedPnl)} />
      </section>

      <section aria-labelledby="hold-title" className="rounded-[10px] border border-rule bg-paper">
        <header className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3">
          <h2 id="hold-title" className="text-[15px] font-semibold">Holdings</h2>
          <StatusPill status={status} />
        </header>
        {error && <p role="alert" className="px-4 pt-3 text-sm text-down">{error}</p>}
        {loading ? (
          <p className="px-4 py-6 text-sm text-muted">Loading your portfolio…</p>
        ) : value.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No holdings yet. Place a buy order below to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Symbol</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Shares</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Avg. buy</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Value</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Unrealized</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Sell</th>
                </tr>
              </thead>
              <tbody>
                {value.rows.map((r) => <HoldingRow key={r.ticker} row={r} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OrderTicket onSymbol={setTicketSymbol} price={ticketSymbol ? priceOf(ticketSymbol) : null} cash={value.cash} />
      <History />
    </div>
  );
}

function HoldingRow({ row: r }: { row: PaperRow }) {
  const { sell, busy } = useSellStock();
  const [shares, setShares] = useState('');
  const n = Number(shares);
  const submit = async (amount: number) => {
    const res = await sell(r.ticker, amount, r.price);
    if (res.ok) setShares('');
  };
  return (
    <tr className="border-t border-rule-soft">
      <td className="px-4 py-2.5">
        <Link href={`/quote/${symbolToPath(r.ticker)}`} className="font-semibold hover:text-accent">{r.ticker}</Link>
        {r.weight !== null && (
          <span className="mt-1 block h-1 w-24 rounded bg-fog" aria-label={`${Math.round(r.weight)}% of portfolio`}>
            <span className="block h-1 rounded bg-accent" style={{ width: `${Math.min(100, r.weight)}%` }} />
          </span>
        )}
      </td>
      <td className="px-2 text-right tabular-nums">{qty(r.shares)}</td>
      <td className="px-2 text-right tabular-nums">{usd(r.avgBuyPrice)}</td>
      <td className="px-2 text-right tabular-nums">{usd(r.price)}</td>
      <td className="px-2 text-right font-semibold tabular-nums">{money(r.marketValue)}</td>
      <td className={`px-2 text-right tabular-nums ${toneOf(r.unrealizedPnl)}`}>
        {signedUsd(r.unrealizedPnl)}
        <span className="block text-xs">{pct(r.unrealizedPnlPct)}</span>
      </td>
      <td className="px-4 py-2">
        <form
          className="flex items-center justify-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (n > 0) submit(n);
          }}
        >
          <input
            type="number" min="0" step="any" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)}
            placeholder="Qty" aria-label={`Shares of ${r.ticker} to sell`}
            className="h-8 w-20 rounded-md border border-rule bg-paper px-2 text-right text-sm tabular-nums focus:border-accent focus:outline-none"
          />
          <button type="submit" disabled={busy || !(n > 0) || r.price === null} className="h-8 rounded-md border border-down px-2.5 text-xs font-semibold text-down hover:bg-down-tint disabled:opacity-40">
            Sell
          </button>
          <button type="button" disabled={busy || r.price === null} onClick={() => submit(r.shares)} className="h-8 rounded-md px-1.5 text-xs text-muted hover:text-down disabled:opacity-40" aria-label={`Sell all ${r.ticker}`}>
            All
          </button>
        </form>
      </td>
    </tr>
  );
}

function OrderTicket({ onSymbol, price, cash }: { onSymbol: (s: string) => void; price: number | null; cash: number }) {
  const { buy, busy: buying } = useBuyStock();
  const { sell, busy: selling } = useSellStock();
  const { portfolio } = usePaperPortfolio();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const ticker = symbol.trim() ? normalizeSymbol(symbol) : '';
  const n = Number(shares);
  const held = portfolio.holdings.find((h) => h.ticker === ticker)?.shares ?? 0;
  const estimate = price !== null && n > 0 ? n * price : null;

  // Look up the price once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => onSymbol(ticker), 400);
    return () => clearTimeout(t);
  }, [ticker, onSymbol]);

  const busy = buying || selling;
  return (
    <section aria-labelledby="order-title" className="rounded-[10px] border border-rule bg-paper p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="order-title" className="text-[15px] font-semibold">Place an order</h2>
        <div role="radiogroup" aria-label="Order side" className="inline-flex rounded-lg border border-rule p-0.5 text-sm">
          {(['buy', 'sell'] as const).map((s) => (
            <button
              key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)}
              className={`rounded-md px-3 py-1 font-semibold capitalize ${side === s ? (s === 'buy' ? 'bg-up-tint text-up' : 'bg-down-tint text-down') : 'text-muted'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <form
        className="grid grid-cols-2 gap-3 md:grid-cols-[1.4fr_1fr_1.4fr_auto] md:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ticker || !(n > 0)) return;
          const res = side === 'buy' ? await buy(ticker, n, price) : await sell(ticker, n, price);
          if (res.ok) setShares('');
        }}
      >
        <label className="grid min-w-0 gap-1 text-xs text-muted">Symbol
          <SymbolInput value={symbol} onChange={setSymbol} required className="w-full min-w-0 text-sm" />
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-muted">Shares
          <input type="number" min="0" step="any" inputMode="decimal" required value={shares} onChange={(e) => setShares(e.target.value)} className={field} />
        </label>
        <div className="col-span-2 grid min-w-0 gap-1 text-xs text-muted md:col-span-1">
          Estimate at live price
          <div className="flex h-10 items-center rounded-lg bg-fog px-3 text-sm tabular-nums text-ink">
            {ticker && price !== null ? (
              <>
                {usd(price)}
                {estimate !== null && <span className="ml-auto text-muted">{side === 'buy' ? 'Cost' : 'Proceeds'} {money(estimate)}</span>}
              </>
            ) : (
              <span className="text-muted">{ticker ? 'Getting price…' : '—'}</span>
            )}
          </div>
        </div>
        <button
          type="submit" disabled={busy || !ticker || !(n > 0)}
          className={`col-span-2 h-10 rounded-lg px-5 font-semibold text-on-accent hover:brightness-110 disabled:opacity-50 md:col-span-1 ${side === 'buy' ? 'bg-up' : 'bg-down'}`}
        >
          {busy ? 'Placing…' : side === 'buy' ? 'Buy' : 'Sell'}
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        {side === 'buy' ? `Cash available ${money(cash)}.` : ticker ? `You hold ${qty(held)} ${ticker}.` : 'Choose a stock you hold.'} Orders fill at the server’s live
        price when they arrive, which can differ slightly from this estimate. US-dollar stocks, ETFs and crypto only.
      </p>
    </section>
  );
}

function History() {
  const { portfolio, reset, guest } = usePaperPortfolio();
  const resetTo = guest ? PAPER_STARTING_CASH : portfolio.startingCash;
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-labelledby="tx-title" className="rounded-[10px] border border-rule bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3">
        <h2 id="tx-title" className="text-[15px] font-semibold">Trade history</h2>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-muted">Clear all trades and go back to {money(resetTo)} in cash?</span>
            <button type="button" onClick={() => { setConfirming(false); reset(); }} className="rounded-md bg-down px-2 py-1 font-semibold text-on-accent">Reset</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-muted hover:text-ink">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-xs text-muted hover:text-down">Reset portfolio</button>
        )}
      </header>
      {portfolio.transactions.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">No trades yet.</p>
      ) : (
        <ul className="max-h-96 overflow-y-auto text-sm">
          {portfolio.transactions.map((t) => (
            <li key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-rule-soft px-4 py-2 first:border-t-0 ${t.pending ? 'opacity-60' : ''}`}>
              <span className={`w-12 text-xs font-semibold ${t.type === 'BUY' ? 'text-up' : 'text-down'}`}>{t.type}</span>
              <span className="w-20 font-semibold">{t.ticker}</span>
              <span className="min-w-0 flex-1 tabular-nums text-muted">
                {qty(t.shares)} at {usd(t.executionPrice)}
                {t.pending && <span className="ml-2 rounded bg-fog px-1.5 text-xs">confirming…</span>}
              </span>
              {t.realizedPnl !== null && (
                <span className={`tabular-nums ${toneOf(t.realizedPnl)}`} title="Realized P&L">{signedUsd(t.realizedPnl)}</span>
              )}
              <span className="w-full text-xs text-muted sm:w-auto">
                {new Date(t.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Figure({ label, value, sub, cls = '', subCls }: { label: string; value: string; sub?: string; cls?: string; subCls?: string }) {
  return (
    <div className="border-rule-soft px-4 py-3 [&:not(:first-child)]:border-l max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(n+3)]:border-t">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${cls}`}>{value}</div>
      {sub && <div className={`text-sm tabular-nums ${subCls ?? cls}`}>{sub}</div>}
    </div>
  );
}
