import { normalizeSymbol } from '@market-reader/core';
import { market } from '@/lib/market';
import { fail, ok } from '@/lib/http';

/** /api/news for market news, /api/news?symbol=AAPL for one symbol. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get('symbol');
  try {
    return ok({ news: await market.news(s ? normalizeSymbol(s) : undefined) }, 300);
  } catch (err) {
    return fail(err);
  }
}
