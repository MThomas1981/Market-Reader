'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyBuy, applySell, emptyPaperPortfolio, formatNumber, formatPrice, paperFromLedger, TradeError,
  type PaperPortfolio, type PaperTrade, type TradeErrorCode, type Transaction,
} from '@market-reader/core';
import { supabaseBrowser } from './supabase/browser';
import { toast } from './toast';
import type { LiveStatus } from './dashboard';

/**
 * Paper trading state for the dashboard.
 *
 * What you see = the last confirmed portfolio + any orders still in flight, applied on top.
 * - Placing an order adds it to the in-flight list, so the holding, cash and history change at once.
 * - When the server confirms, the order leaves the list and the confirmed portfolio is refreshed
 *   (signed in: re-read from Supabase; guest: the order is applied at the server's price and saved).
 * - When it fails, the order simply leaves the list (that is the rollback) and a toast says why.
 * Signed in, a Supabase Realtime channel refreshes the portfolio when a trade lands from another
 * tab or device. Refreshes wait while an order is in flight, so an order is never counted twice.
 */

type Side = 'buy' | 'sell';
interface Pending { key: string; side: Side; ticker: string; shares: number; estPrice: number; at: string }

const GUEST_KEY = 'market-reader.paper';
const OLD_LEDGER_KEY = 'market-reader.transactions';

function readGuest(): { portfolio: PaperPortfolio; carried: boolean } {
  try {
    const saved = localStorage.getItem(GUEST_KEY);
    const parsed = saved ? (JSON.parse(saved) as PaperPortfolio) : null;
    // Use the saved portfolio, unless it is only an untouched carry-over (rebuild it with the current rule).
    const untouched = parsed && parsed.transactions.length > 0 && parsed.transactions.every((t) => t.id.startsWith('carried-'));
    if (parsed && !untouched) return { portfolio: parsed, carried: false };
    const ledger = JSON.parse(localStorage.getItem(OLD_LEDGER_KEY) ?? '[]') as Transaction[];
    if (ledger.length) {
      const portfolio = paperFromLedger(ledger);
      localStorage.setItem(GUEST_KEY, JSON.stringify(portfolio));
      return { portfolio, carried: !parsed && portfolio.holdings.length > 0 };
    }
  } catch {
    /* private mode or bad data: start fresh */
  }
  return { portfolio: emptyPaperPortfolio(), carried: false };
}

function writeGuest(p: PaperPortfolio) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

interface PortfolioRow { id: string; name: string; starting_cash: number | string; cash_balance: number | string }
interface HoldingRow { ticker: string; shares: number | string; avg_buy_price: number | string }
interface TxRow { id: string; ticker: string; type: 'BUY' | 'SELL'; shares: number | string; execution_price: number | string; realized_pnl: number | string | null; created_at: string }

async function fetchAccount(): Promise<PaperPortfolio> {
  const db = supabaseBrowser();
  const { data: pf, error } = await db.from('portfolios').select('id, name, starting_cash, cash_balance').order('created_at').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pf) throw new Error('No paper portfolio on this account yet. Run the paper-trading migration in Supabase.');
  const p = pf as PortfolioRow;
  const [h, t] = await Promise.all([
    db.from('holdings').select('ticker, shares, avg_buy_price').eq('portfolio_id', p.id),
    db.from('transactions').select('id, ticker, type, shares, execution_price, realized_pnl, created_at')
      .eq('portfolio_id', p.id).order('created_at', { ascending: false }).limit(200),
  ]);
  if (h.error) throw new Error(h.error.message);
  if (t.error) throw new Error(t.error.message);
  return {
    id: p.id,
    name: p.name,
    startingCash: Number(p.starting_cash),
    cashBalance: Number(p.cash_balance),
    holdings: ((h.data ?? []) as HoldingRow[]).map((r) => ({ ticker: r.ticker, shares: Number(r.shares), avgBuyPrice: Number(r.avg_buy_price) })),
    transactions: ((t.data ?? []) as TxRow[]).map((r) => ({
      id: r.id, ticker: r.ticker, type: r.type, shares: Number(r.shares), executionPrice: Number(r.execution_price),
      realizedPnl: r.realized_pnl === null ? null : Number(r.realized_pnl), createdAt: r.created_at,
    })),
  };
}

function overlay(base: PaperPortfolio, pending: Pending[]): PaperPortfolio {
  let p = base;
  for (const o of pending) {
    try {
      const r = (o.side === 'sell' ? applySell : applyBuy)(p, o.ticker, o.shares, o.estPrice, { id: o.key, at: o.at });
      p = { ...r.portfolio, transactions: r.portfolio.transactions.map((t) => (t.id === o.key ? { ...t, pending: true } : t)) };
    } catch {
      /* no longer applies on the newer base; the server's answer decides */
    }
  }
  return p;
}

export interface TradeOutcome { ok: boolean; trade?: PaperTrade; error?: string; code?: TradeErrorCode }

interface PaperState {
  portfolio: PaperPortfolio;
  status: LiveStatus;
  loading: boolean;
  error: string | null;
  inFlight: number;
  guest: boolean;
  place: (side: Side, ticker: string, shares: number, estPrice?: number | null) => Promise<TradeOutcome>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
}

function usePaperState(userId: string | null): PaperState {
  const guest = !userId;
  const [confirmed, setConfirmed] = useState<PaperPortfolio>(() => emptyPaperPortfolio());
  const [pending, setPending] = useState<Pending[]>([]);
  const [status, setStatus] = useState<LiveStatus>(guest ? 'local' : 'connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(0);
  const latest = useRef(confirmed);
  latest.current = confirmed;

  const refresh = useCallback(async () => {
    if (guest) {
      setConfirmed(readGuest().portfolio);
      return;
    }
    if (inFlight.current > 0) return; // the order in flight refreshes when it settles
    try {
      setConfirmed(await fetchAccount());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [guest]);

  useEffect(() => {
    setLoading(true);
    setPending([]);
    if (guest) {
      const { portfolio, carried } = readGuest();
      setConfirmed(portfolio);
      setStatus('local');
      setLoading(false);
      if (carried) toast({ tone: 'info', title: 'Positions carried over', body: 'Your recorded holdings are now in your paper portfolio at their average cost, with $100,000 of paper cash on top.' });
      // Another tab trading in this browser.
      const onStorage = (e: StorageEvent) => e.key === GUEST_KEY && setConfirmed(readGuest().portfolio);
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }
    const db = supabaseBrowser();
    refresh().finally(() => setLoading(false));
    const filter = `user_id=eq.${userId}`;
    const channel = db
      .channel(`paper:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolios', filter }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings', filter }, () => refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter }, () => refresh())
      .subscribe((s: string) => setStatus(s === 'SUBSCRIBED' ? 'live' : s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? 'offline' : 'connecting'));
    return () => {
      db.removeChannel(channel);
    };
  }, [guest, userId, refresh]);

  // Orders the server accepted, kept on screen until the refreshed portfolio includes them.
  const done = useRef(new Set<string>());
  const settle = useCallback(async (key: string, ok: boolean) => {
    inFlight.current -= 1;
    if (guest || !ok) {
      setPending((list) => list.filter((o) => o.key !== key)); // guest: already saved; failure: rollback
      return;
    }
    done.current.add(key);
    if (inFlight.current > 0) return; // the last order to finish refreshes for all of them
    try {
      setConfirmed(await fetchAccount());
    } catch (e) {
      setError((e as Error).message);
    }
    const finished = new Set(done.current);
    done.current.clear();
    setPending((list) => list.filter((o) => !finished.has(o.key)));
  }, [guest]);

  const place = useCallback(async (side: Side, rawTicker: string, shares: number, estPrice?: number | null): Promise<TradeOutcome> => {
    const ticker = rawTicker.trim().toUpperCase();
    const key = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const at = new Date().toISOString();

    // Check against what is on screen first, so an obvious mistake fails instantly.
    if (estPrice && estPrice > 0) {
      try {
        (side === 'sell' ? applySell : applyBuy)(overlay(latest.current, pending), ticker, shares, estPrice);
      } catch (e) {
        const err = e as TradeError;
        toast({ tone: 'error', title: err.message, body: describeLocalError(err, side, ticker, shares) });
        return { ok: false, error: err.message, code: err.code };
      }
      setPending((list) => [...list, { key, side, ticker, shares, estPrice, at }]); // optimistic
    }
    inFlight.current += 1;

    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side, ticker, shares, portfolioId: guest ? undefined : latest.current.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new TradeError(body.error ?? 'The order didn’t go through.', (body.code as TradeErrorCode) ?? 'unknown');

      let trade: PaperTrade;
      if (body.mode === 'guest') {
        // Apply at the server's live price to the newest saved copy, then save.
        const r = (side === 'sell' ? applySell : applyBuy)(readGuest().portfolio, body.ticker, shares, body.price);
        writeGuest(r.portfolio);
        setConfirmed(r.portfolio);
        trade = r.trade;
      } else {
        const x = body.result as { transaction_id: string; realized_pnl?: number | string; created_at: string };
        trade = {
          id: x.transaction_id, ticker: body.ticker, type: side === 'sell' ? 'SELL' : 'BUY', shares, executionPrice: body.price,
          realizedPnl: side === 'sell' ? Number(x.realized_pnl) : null, createdAt: x.created_at,
        };
      }
      toast({ tone: 'success', title: confirmTitle(trade), body: body.demo ? `${confirmBody(trade)} Filled at a demo price: this copy has no market-data key.` : confirmBody(trade) });
      await settle(key, true);
      return { ok: true, trade };
    } catch (e) {
      const err = e instanceof TradeError ? e : new TradeError('Couldn’t reach the server. Nothing was traded.', 'unknown');
      await settle(key, false); // rollback: the optimistic order disappears
      toast({ tone: 'error', title: err.message, body: err.code === 'insufficient_shares' ? `You don’t hold ${formatNumber(shares, shares % 1 ? 4 : 0)} shares of ${ticker}.` : undefined });
      return { ok: false, error: err.message, code: err.code };
    }
  }, [guest, pending, settle]);

  const reset = useCallback(async () => {
    if (guest) {
      const fresh = emptyPaperPortfolio();
      writeGuest(fresh);
      setConfirmed(fresh);
    } else {
      const { error: err } = await supabaseBrowser().rpc('reset_paper_portfolio', { p_portfolio_id: latest.current.id });
      if (err) {
        toast({ tone: 'error', title: 'Couldn’t reset', body: err.message });
        return;
      }
      await refresh();
    }
    toast({ tone: 'info', title: 'Paper portfolio reset', body: 'Back to $100,000 in cash.' });
  }, [guest, refresh]);

  const portfolio = useMemo(() => overlay(confirmed, pending), [confirmed, pending]);
  return { portfolio, status, loading, error, inFlight: pending.length, guest, place, reset, refresh };
}

const usd = (v: number) => formatPrice(v, 'USD');
const money = (v: number) => `$${formatNumber(v, 2)}`;
const qty = (n: number) => formatNumber(n, n % 1 ? 4 : 0);
const confirmTitle = (t: PaperTrade) => `${t.type === 'SELL' ? 'Sold' : 'Bought'} ${qty(t.shares)} ${t.ticker} at ${usd(t.executionPrice)}`;
const confirmBody = (t: PaperTrade) =>
  t.type === 'SELL' && t.realizedPnl !== null
    ? `Realized ${t.realizedPnl >= 0 ? 'gain' : 'loss'} of ${money(Math.abs(t.realizedPnl))}. Simulated trade.`
    : `${money(t.shares * t.executionPrice)} taken from cash. Simulated trade.`;
function describeLocalError(e: TradeError, side: Side, ticker: string, shares: number) {
  if (e.code === 'insufficient_shares') return `You don’t hold ${qty(shares)} shares of ${ticker}.`;
  if (e.code === 'insufficient_cash') return `Not enough paper cash to ${side} ${qty(shares)} ${ticker}.`;
  return undefined;
}

// ---------- Public hooks ----------

const PaperContext = createContext<PaperState | null>(null);

/** Holds the paper portfolio for everything inside it (holdings table, order ticket, history). */
export function PaperProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const state = usePaperState(userId);
  return createElement(PaperContext.Provider, { value: state }, children);
}

export function usePaperPortfolio(): PaperState {
  const ctx = useContext(PaperContext);
  if (!ctx) throw new Error('usePaperPortfolio must be used inside <PaperProvider>.');
  return ctx;
}

/**
 * Sell shares at the live price. The holding, cash and history update immediately; the
 * database then executes execute_sell_order atomically, and errors such as
 * "Insufficient shares to sell" appear as a toast with the screen rolled back.
 */
export function useSellStock() {
  const { place } = usePaperPortfolio();
  const [busy, setBusy] = useState(false);
  const sell = useCallback(async (ticker: string, shares: number, estPrice?: number | null) => {
    setBusy(true);
    try {
      return await place('sell', ticker, shares, estPrice);
    } finally {
      setBusy(false);
    }
  }, [place]);
  return { sell, busy };
}

/** Buy shares at the live price (same flow as useSellStock). */
export function useBuyStock() {
  const { place } = usePaperPortfolio();
  const [busy, setBusy] = useState(false);
  const buy = useCallback(async (ticker: string, shares: number, estPrice?: number | null) => {
    setBusy(true);
    try {
      return await place('buy', ticker, shares, estPrice);
    } finally {
      setBusy(false);
    }
  }, [place]);
  return { buy, busy };
}
