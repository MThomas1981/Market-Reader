import { MAX_LOOKBACK, RANGES, lookbackBucket, normalizeSymbol, type Range } from '@market-reader/core';
import { market } from '@/lib/market';
import { fail, ok } from '@/lib/http';

/**
 * Chart history: /api/history/AAPL?range=1Y&lookback=200
 *   range     1D 5D 1M 6M YTD 1Y 5Y MAX (bar size follows the range: 5m, 15m, 1h, daily, weekly)
 *   lookback  extra bars before the visible range for indicator warm-up (0–500, rounded up to a bucket)
 * The response's `visibleFrom` marks the first bar to display; earlier bars are only for calculations.
 */
export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = normalizeSymbol((await params).symbol);
  const q = new URL(req.url).searchParams;
  const r = (q.get('range') ?? '1M').toUpperCase() as Range;
  const range: Range = RANGES.includes(r) ? r : '1M';
  const lookback = lookbackBucket(Math.min(MAX_LOOKBACK, Number(q.get('lookback')) || 0));
  try {
    return ok(await market.history(symbol, range, lookback), range === '1D' || range === '5D' ? 60 : 600);
  } catch (err) {
    return fail(err);
  }
}
