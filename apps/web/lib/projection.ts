import 'server-only';
import { HORIZONS, cagrRating, forecast, type CagrRating, type ForecastResult, type History } from '@market-reader/core';
import { market } from './market';

/**
 * Everything behind a price projection: the past year of daily prices for the ranges, the long
 * history for the CAGR rating (graded A–F and compared with the S&P 500), and the forecast itself,
 * whose trend is anchored on that CAGR. Every projection in the app goes through here.
 */
export async function projectionFor(symbol: string): Promise<{ history: History; cagr: CagrRating; forecast: ForecastResult }> {
  const inst = market.instrument(symbol);
  const everyDay = inst.assetClass === 'crypto';
  const compare = inst.assetClass !== 'forex' && inst.symbol !== 'SPY';
  const [history, long, spy] = await Promise.all([
    market.history(symbol, '1Y'),
    market.history(symbol, 'MAX').catch(() => null),
    compare ? market.history('SPY', 'MAX').catch(() => null) : Promise.resolve(null),
  ]);
  const real = (h: History | null) => (h && h.source !== 'Demo data') || history.source === 'Demo data';
  const longCandles = long && real(long) ? long.candles : history.candles;
  const cagr = cagrRating(longCandles, spy && real(spy) ? { symbol: 'SPY', candles: spy.candles } : null, { currencyPair: inst.assetClass === 'forex' });
  const result = forecast(history.candles, HORIZONS, { everyDay, longRun: { cagrPct: cagr.cagrPct, basisYears: cagr.basisYears } });
  return { history, cagr, forecast: result };
}
