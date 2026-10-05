import { NextResponse } from 'next/server';
import { normalizeSymbol } from '@market-reader/core';
import { getViewer, type Viewer } from '@/lib/viewer';
import { market } from '@/lib/market';

const noStore = { 'Cache-Control': 'no-store' };

async function defaultListId(v: Viewer): Promise<number> {
  const db = v.db!;
  const { data } = await db.from('watchlists').select('id').eq('position', 0).maybeSingle();
  if (data) return data.id as number;
  const { data: created, error } = await db.from('watchlists').insert({ user_id: v.user!.id, name: 'My watchlist', position: 0 }).select('id').single();
  if (error) throw error;
  return created!.id as number;
}

/** The signed-in user's watchlist, synced across web and phone. 401 for guests (they keep a local list). */
export async function GET(req: Request) {
  const v = await getViewer(req);
  if (!v.user || !v.db) return NextResponse.json({ error: 'Sign in to sync your watchlist.' }, { status: 401, headers: noStore });
  const { data, error } = await v.db.from('watchlist_items').select('symbol, position').order('position');
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ symbols: (data ?? []).map((r) => r.symbol as string), limit: v.limits.watchlistSymbols, plan: v.plan }, { headers: noStore });
}

/** Replace the watchlist with { symbols: [...] } (order is kept). */
export async function PUT(req: Request) {
  const v = await getViewer(req);
  if (!v.user || !v.db) return NextResponse.json({ error: 'Sign in to sync your watchlist.' }, { status: 401, headers: noStore });
  let body: { symbols?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send { "symbols": [...] }.' }, { status: 400, headers: noStore });
  }
  const symbols = [...new Set((Array.isArray(body.symbols) ? body.symbols : []).filter((s): s is string => typeof s === 'string').map(normalizeSymbol))];
  if (symbols.length > v.limits.watchlistSymbols) {
    return NextResponse.json(
      { error: `The ${v.limits.label} plan holds up to ${v.limits.watchlistSymbols} symbols. Upgrade to Pro for more.`, limit: v.limits.watchlistSymbols },
      { status: 402, headers: noStore },
    );
  }
  try {
    const db = v.db;
    const listId = await defaultListId(v);
    const { data: before } = await db.from('watchlist_items').select('symbol').eq('watchlist_id', listId);
    const had = new Set((before ?? []).map((r) => r.symbol as string));
    await db.from('watchlist_items').delete().eq('watchlist_id', listId);
    if (symbols.length) {
      const { error } = await db.from('watchlist_items').insert(symbols.map((symbol, position) => ({ watchlist_id: listId, user_id: v.user!.id, symbol, position })));
      if (error) throw error;
    }
    // Newly saved symbols go into the user's history with today's price, so they can see how it does from here.
    const added = symbols.filter((s) => !had.has(s));
    if (added.length && v.limits.historyItems > 0) {
      const quotes = await market.quotes(added).catch(() => []);
      await Promise.all(
        added.map((s) => {
          const q = quotes.find((x) => x.symbol === s);
          return db.rpc('record_symbol_view', { p_symbol: s, p_price: q?.price ?? null, p_currency: q?.currency ?? null, p_saved: true });
        }),
      );
    }
    return NextResponse.json({ symbols }, { headers: noStore });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers: noStore });
  }
}
