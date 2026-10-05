import { NextResponse } from 'next/server';
import { HORIZONS, backtest, normalizeSymbol } from '@market-reader/core';
import { getViewer } from '@/lib/viewer';
import { projectionFor } from '@/lib/projection';
import { market } from '@/lib/market';

/**
 * Price-range estimates for 1 day to 6 months, always with the CAGR rating that anchors their trend.
 * Free and guests: 1D and 1W. Pro: all horizons plus the method's past accuracy (backtest).
 */
export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = normalizeSymbol((await params).symbol);
  const v = await getViewer(req);
  try {
    const { history, cagr, forecast: result } = await projectionFor(symbol);
    const everyDay = market.instrument(symbol).assetClass === 'crypto';
    const allowed = new Set(v.limits.forecastHorizons);
    const points = result.points.filter((p) => allowed.has(p.horizon));
    const locked = HORIZONS.filter((h) => !allowed.has(h));
    const accuracy = v.limits.forecastBacktest
      ? points.map((p) => backtest(history.candles, p.horizon, { everyDay, step: 2 })).filter((b) => b !== null)
      : null;
    return NextResponse.json(
      {
        symbol,
        plan: v.plan,
        lastPrice: result.lastPrice,
        lastDate: result.lastDate,
        annualVolatility: result.annualVolatility,
        sampleSize: result.sampleSize,
        method: result.method,
        trend: result.trend,
        cagr,
        source: history.source,
        points,
        locked,
        accuracy,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
