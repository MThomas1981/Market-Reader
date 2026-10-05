import type { Candle, History, Instrument } from '../types';
import { isoDate } from '../ranges';
import type { ChartWindow } from '../chart-window';
import { getJSON, ProviderError } from './http';

const NAME = 'Massive';

interface Aggs { results?: { o: number; h: number; l: number; c: number; v: number; t: number }[]; status?: string }

/**
 * Price history for US stocks and ETFs (Massive, formerly Polygon.io): minute, hour, day or week bars.
 * Free tier: about 2 years, end of day. Intraday bars include pre-market and after-hours trading.
 */
export class MassiveProvider {
  readonly name = NAME;
  constructor(private apiKey: string, private baseUrl = 'https://api.massive.com') {}

  async history(inst: Instrument, w: ChartWindow): Promise<History> {
    const { multiplier, timespan } = w.resolution;
    const from = w.from ? isoDate(w.from) : '1970-01-01';
    const url =
      `${this.baseUrl}/v2/aggs/ticker/${encodeURIComponent(inst.symbol)}/range/${multiplier}/${timespan}` +
      `/${from}/${isoDate(w.to)}?adjusted=true&sort=asc&limit=50000&apiKey=${this.apiKey}`;
    const r = await getJSON<Aggs>(NAME, url);
    const candles: Candle[] = (r.results ?? []).map((b) => ({
      time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }));
    if (candles.length === 0) throw new ProviderError(NAME, `no history for ${inst.symbol} (${w.range})`, 404);
    return { symbol: inst.symbol, range: w.range, candles, source: NAME };
  }
}
