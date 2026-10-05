/**
 * Paper trading (simulated money). The same rules as the database functions
 * execute_buy_order / execute_sell_order in supabase/migrations/20261005000000_paper_trading.sql,
 * so the screen can update the instant you trade (optimistic update) and guests can trade in
 * this browser with no account. The database stays the source of truth for signed-in users.
 */
import { computeHoldings, type Transaction } from './portfolio';

export const PAPER_STARTING_CASH = 100_000;

export interface PaperHolding {
  ticker: string;
  shares: number;
  avgBuyPrice: number;
}

export interface PaperTrade {
  id: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  executionPrice: number;
  /** (executionPrice − avgBuyPrice) × shares, for sales; null for buys */
  realizedPnl: number | null;
  createdAt: string;
  /** Shown while the trade is still being confirmed by the server */
  pending?: boolean;
}

export interface PaperPortfolio {
  id: string;
  name: string;
  startingCash: number;
  cashBalance: number;
  holdings: PaperHolding[];
  /** Newest first */
  transactions: PaperTrade[];
}

export type TradeErrorCode =
  | 'insufficient_shares'
  | 'insufficient_cash'
  | 'invalid_shares'
  | 'invalid_price'
  | 'invalid_ticker'
  | 'portfolio_not_found'
  | 'not_signed_in'
  | 'not_tradable'
  | 'no_price'
  | 'unknown';

export class TradeError extends Error {
  constructor(message: string, readonly code: TradeErrorCode) {
    super(message);
    this.name = 'TradeError';
  }
}

/** Cents, rounding halves away from zero like Postgres round(x, 2). */
export function roundCents(x: number): number {
  const cents = Math.round(Number((Math.abs(x) * 100).toPrecision(15)));
  return (Math.sign(x) * cents) / 100 || 0;
}

/** Share counts and average prices are stored to 10 decimal places (numeric(28, 10)). */
const round10 = (x: number) => Number(x.toFixed(10));

function validate(ticker: string, shares: number, price: number, side: 'buy' | 'sell') {
  const t = ticker.trim().toUpperCase();
  if (!t || t.length > 20) throw new TradeError('Enter a valid ticker.', 'invalid_ticker');
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new TradeError(`Shares to ${side} must be greater than zero.`, 'invalid_shares');
  }
  if (!Number.isFinite(price) || price <= 0) throw new TradeError('No valid price to execute at.', 'invalid_price');
  return t;
}

export interface TradeResult {
  portfolio: PaperPortfolio;
  trade: PaperTrade;
}

/**
 * Sell shares at `price`: shrinks the holding (removes it when fully sold), credits
 * shares × price to cash, and records the realized P&L. Throws "Insufficient shares to sell"
 * when you hold fewer shares than you are selling. Never mutates its input.
 */
export function applySell(
  p: PaperPortfolio,
  ticker: string,
  shares: number,
  price: number,
  meta: { id?: string; at?: string } = {},
): TradeResult {
  const t = validate(ticker, shares, price, 'sell');
  const held = p.holdings.find((h) => h.ticker === t);
  if (!held || held.shares < shares) throw new TradeError('Insufficient shares to sell', 'insufficient_shares');

  const proceeds = roundCents(shares * price);
  const realizedPnl = roundCents((price - held.avgBuyPrice) * shares);
  const remaining = round10(held.shares - shares);
  const holdings = remaining <= 0
    ? p.holdings.filter((h) => h !== held)
    : p.holdings.map((h) => (h === held ? { ...h, shares: remaining } : h));

  const trade: PaperTrade = {
    id: meta.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticker: t, type: 'SELL', shares, executionPrice: price, realizedPnl, createdAt: meta.at ?? new Date().toISOString(),
  };
  return {
    portfolio: { ...p, cashBalance: roundCents(p.cashBalance + proceeds), holdings, transactions: [trade, ...p.transactions] },
    trade,
  };
}

/**
 * Buy shares at `price`: debits shares × price from cash and adds to the holding at a
 * share-weighted average buy price. Throws "Insufficient cash" when the cost is more than the cash.
 */
export function applyBuy(
  p: PaperPortfolio,
  ticker: string,
  shares: number,
  price: number,
  meta: { id?: string; at?: string } = {},
): TradeResult {
  const t = validate(ticker, shares, price, 'buy');
  const cost = roundCents(shares * price);
  if (cost > p.cashBalance) throw new TradeError('Insufficient cash', 'insufficient_cash');

  const held = p.holdings.find((h) => h.ticker === t);
  const holdings = held
    ? p.holdings.map((h) =>
        h === held
          ? {
              ...h,
              shares: round10(h.shares + shares),
              avgBuyPrice: round10((h.shares * h.avgBuyPrice + shares * price) / (h.shares + shares)),
            }
          : h,
      )
    : [...p.holdings, { ticker: t, shares, avgBuyPrice: price }];

  const trade: PaperTrade = {
    id: meta.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticker: t, type: 'BUY', shares, executionPrice: price, realizedPnl: null, createdAt: meta.at ?? new Date().toISOString(),
  };
  return {
    portfolio: { ...p, cashBalance: roundCents(p.cashBalance - cost), holdings, transactions: [trade, ...p.transactions] },
    trade,
  };
}

export function emptyPaperPortfolio(id = 'local', startingCash = PAPER_STARTING_CASH): PaperPortfolio {
  return { id, name: 'Paper portfolio', startingCash, cashBalance: startingCash, holdings: [], transactions: [] };
}

/**
 * Carry positions from the old hand-entered ledger into a paper portfolio. Each open position
 * becomes a holding at its average cost, and you still get the full $100,000 of paper cash on top.
 * The starting value is cash plus the carried cost, so returns are measured from there.
 */
export function paperFromLedger(ledger: Transaction[]): PaperPortfolio {
  const open = computeHoldings(ledger).filter((h) => h.quantity > 1e-9);
  const cost = roundCents(open.reduce((s, h) => s + h.quantity * h.averageCost, 0));
  const start = roundCents(PAPER_STARTING_CASH + cost);
  const firstBuy = (sym: string) =>
    ledger.filter((t) => t.symbol === sym && t.type === 'buy').map((t) => t.tradedAt).sort()[0] ?? new Date().toISOString();
  const iso = (d: string) => (d.length === 10 ? `${d}T16:00:00.000Z` : d);
  return {
    ...emptyPaperPortfolio('local', start),
    cashBalance: PAPER_STARTING_CASH,
    holdings: open.map((h) => ({ ticker: h.symbol, shares: round10(h.quantity), avgBuyPrice: round10(h.averageCost) })),
    transactions: open
      .map((h, i): PaperTrade => ({
        id: `carried-${i}`, ticker: h.symbol, type: 'BUY', shares: round10(h.quantity), executionPrice: round10(h.averageCost),
        realizedPnl: null, createdAt: iso(firstBuy(h.symbol)),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export interface PaperRow extends PaperHolding {
  price: number | null;
  marketValue: number | null;
  costBasis: number;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  dayChange: number | null;
  weight: number | null;
}

export interface PaperValuation {
  cash: number;
  holdingsValue: number;
  /** Cash plus holdings at live prices (holdings without a price count at cost) */
  totalValue: number;
  dayChange: number;
  unrealizedPnl: number;
  realizedPnl: number;
  /** Total value against the starting cash */
  totalReturn: number;
  totalReturnPct: number;
  rows: PaperRow[];
}

export function valuePaperPortfolio(
  p: PaperPortfolio,
  quotes: Map<string, { price: number; change: number }>,
): PaperValuation {
  const rows: PaperRow[] = p.holdings.map((h) => {
    const q = quotes.get(h.ticker);
    const costBasis = h.shares * h.avgBuyPrice;
    const marketValue = q ? h.shares * q.price : null;
    const unrealizedPnl = marketValue === null ? null : marketValue - costBasis;
    return {
      ...h,
      price: q?.price ?? null,
      marketValue,
      costBasis,
      unrealizedPnl,
      unrealizedPnlPct: unrealizedPnl === null || !costBasis ? null : (unrealizedPnl / costBasis) * 100,
      dayChange: q ? h.shares * q.change : null,
      weight: null,
    };
  });
  const holdingsValue = rows.reduce((s, r) => s + (r.marketValue ?? r.costBasis), 0);
  const totalValue = p.cashBalance + holdingsValue;
  for (const r of rows) r.weight = totalValue ? ((r.marketValue ?? r.costBasis) / totalValue) * 100 : null;
  rows.sort((a, b) => (b.marketValue ?? b.costBasis) - (a.marketValue ?? a.costBasis));
  const totalReturn = totalValue - p.startingCash;
  return {
    cash: p.cashBalance,
    holdingsValue,
    totalValue,
    dayChange: rows.reduce((s, r) => s + (r.dayChange ?? 0), 0),
    unrealizedPnl: rows.reduce((s, r) => s + (r.unrealizedPnl ?? 0), 0),
    realizedPnl: roundCents(p.transactions.reduce((s, t) => s + (t.realizedPnl ?? 0), 0)),
    totalReturn,
    totalReturnPct: p.startingCash ? (totalReturn / p.startingCash) * 100 : 0,
    rows,
  };
}

/** Database error from the trade functions → a TradeError with a short, readable message. */
export function tradeErrorFromDb(err: { message?: string; hint?: string; code?: string } | null | undefined): TradeError {
  const hint = (err?.hint ?? '') as TradeErrorCode;
  const known: TradeErrorCode[] = ['insufficient_shares', 'insufficient_cash', 'invalid_shares', 'invalid_price', 'invalid_ticker', 'portfolio_not_found', 'not_signed_in'];
  return new TradeError(err?.message || 'The trade didn’t go through.', known.includes(hint) ? hint : 'unknown');
}
