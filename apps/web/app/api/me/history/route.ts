import { NextResponse } from 'next/server';
import { normalizeSymbol } from '@market-reader/core';
import { getViewer } from '@/lib/viewer';
import { market } from '@/lib/market';

const noStore = { 'Cache-Control': 'no-store' };

interface Row {
  symbol: string; first_seen_at: string; last_seen_at: string; first_price: number | null;
  first_currency: string | null; view_count: number; saved: boolean;
}

/**
 * Past stock selections: every symbol the user viewed or saved, with the price when they first
 * looked and how it has done since. Free keeps the last 10; Pro keeps everything.
 */
export async function GET(req: Request) {
  const v = await getViewer(req);
  if (!v.user || !v.db) return NextResponse.json({ error: 'Sign in to keep a history of the stocks you look at.' }, { status: 401, headers: noStore });
  const { data, error } = await v.db
    .from('symbol_history')
    .select('symbol, first_seen_at, last_seen_at, first_price, first_currency, view_count, saved')
    .order('last_seen_at', { ascending: false })
    .limit(Math.min(v.limits.historyItems, 500));
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  const rows = (data ?? []) as Row[];
  const quotes = await market.quotes(rows.map((r) => r.symbol)).catch(() => []);
  const items = rows.map((r) => {
    const q = quotes.find((x) => x.symbol === r.symbol);
    const first = r.first_price !== null ? Number(r.first_price) : null;
    return {
      symbol: r.symbol,
      name: market.instrument(r.symbol).name,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      views: r.view_count,
      saved: r.saved,
      firstPrice: first,
      price: q?.price ?? null,
      currency: q?.currency ?? r.first_currency ?? 'USD',
      changeSinceFirstPct: first && q ? (q.price / first - 1) * 100 : null,
      source: q?.source ?? null,
    };
  });
  return NextResponse.json({ items, plan: v.plan, keeps: v.limits.historyItems }, { headers: noStore });
}

/** Record a view: { symbol }. Called by quote pages for signed-in users. */
export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!v.user || !v.db || v.limits.historyItems === 0) return NextResponse.json({ recorded: false }, { headers: noStore });
  let symbol = '';
  try {
    symbol = normalizeSymbol(String((await req.json()).symbol ?? ''));
  } catch {
    /* fall through */
  }
  if (!symbol) return NextResponse.json({ error: 'Send { "symbol": "AAPL" }.' }, { status: 400, headers: noStore });
  const q = await market.quote(symbol).catch(() => null);
  const { error } = await v.db.rpc('record_symbol_view', { p_symbol: symbol, p_price: q?.price ?? null, p_currency: q?.currency ?? null, p_saved: null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  if (v.plan !== 'pro') await v.db.rpc('trim_symbol_history', { keep: v.limits.historyItems });
  return NextResponse.json({ recorded: true }, { headers: noStore });
}
