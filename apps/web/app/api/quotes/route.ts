import { normalizeSymbol } from '@market-reader/core';
import { market } from '@/lib/market';
import { fail, live } from '@/lib/http';

/** Batch quotes for watchlists: /api/quotes?symbols=AAPL,BTC-USD,EURUSD */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('symbols') ?? '';
  const symbols = [...new Set(raw.split(',').filter(Boolean).map(normalizeSymbol))].slice(0, 50);
  try {
    const quotes = await market.quotes(symbols);
    return live({ quotes, instruments: symbols.map((s) => market.instrument(s)) });
  } catch (err) {
    return fail(err);
  }
}
