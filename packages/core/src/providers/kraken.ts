import type { Candle, History, Instrument } from '../types';
import type { ChartWindow } from '../chart-window';
import { getJSON, ProviderError } from './http';

const NAME = 'Kraken';

/** Kraken's names for a few assets differ from the usual tickers. */
const KRAKEN_BASE: Record<string, string> = { BTC: 'XBT', DOGE: 'XDG' };

/** Bar sizes Kraken offers, in minutes. */
const INTERVALS = [1, 5, 15, 30, 60, 240, 1440, 10080];

/** Kraken returns at most this many of the most recent bars per request. */
export const KRAKEN_MAX_BARS = 720;

/**
 * Crypto OHLC bars from Kraken's public market data, no key needed: 5- and 15-minute bars for
 * 1D/5D, daily bars up to about 2 years, weekly bars back to 2013 for Bitcoin.
 */
export class KrakenProvider {
  readonly name = NAME;

  async history(inst: Instrument, w: ChartWindow): Promise<History> {
    const base = inst.symbol.replace(/-USD$/, '');
    const pair = `${KRAKEN_BASE[base] ?? base}USD`;
    const minutes = w.resolution.seconds / 60;
    const interval = INTERVALS.find((m) => m >= minutes) ?? 10080;
    const since = w.from ? `&since=${Math.floor(w.from / 1000)}` : '';
    const r = await getJSON<{ error?: string[]; result?: Record<string, unknown> }>(
      NAME,
      `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}${since}`,
    );
    if (r.error?.length) throw new ProviderError(NAME, r.error.join(', '), /Unknown asset pair/i.test(r.error.join()) ? 404 : undefined);
    const key = Object.keys(r.result ?? {}).find((k) => k !== 'last');
    const rows = (key ? r.result![key] : []) as [number, string, string, string, string, string, string, number][];
    const from = w.from / 1000;
    const candles: Candle[] = rows
      .filter((row) => row[0] >= from)
      .map(([t, o, h, l, c, , v]) => ({ time: t, open: +o, high: +h, low: +l, close: +c, volume: +v }));
    if (candles.length === 0) throw new ProviderError(NAME, `no history for ${inst.symbol}`, 404);
    return { symbol: inst.symbol, range: w.range, candles, source: NAME };
  }
}
