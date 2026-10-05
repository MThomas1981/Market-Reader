import type { Candle, History, Instrument } from '../types';
import { isoDate } from '../ranges';
import type { ChartWindow } from '../chart-window';
import { getJSON, ProviderError } from './http';

const NAME = 'Tiingo';
const BASE = 'https://api.tiingo.com/tiingo/daily';

interface TiingoRow {
  date: string;
  open: number; high: number; low: number; close: number; volume: number;
  adjOpen?: number; adjHigh?: number; adjLow?: number; adjClose?: number; adjVolume?: number;
}

/**
 * Long US stock and ETF history (daily or weekly bars, back to 1962) from Tiingo's end-of-day API.
 * Free key at https://www.tiingo.com; free plan: 50 requests an hour, 1,000 a day, history back to 1962.
 * Prices are adjusted for splits and dividends so decades of history line up with today's price.
 */
export class TiingoProvider {
  readonly name = NAME;
  constructor(private apiKey: string) {}

  /** Tiingo writes share classes with a dash: BRK.B -> BRK-B. */
  private ticker(inst: Instrument) {
    return inst.symbol.replace('.', '-').toLowerCase();
  }

  async history(inst: Instrument, w: ChartWindow): Promise<History> {
    const range = w.range;
    const start = w.from ? isoDate(w.from) : '1900-01-01';
    const freq = w.resolution.timespan === 'week' ? 'weekly' : 'daily';
    const rows = await getJSON<TiingoRow[] | { detail?: string }>(
      NAME,
      `${BASE}/${encodeURIComponent(this.ticker(inst))}/prices?startDate=${start}&resampleFreq=${freq}&token=${encodeURIComponent(this.apiKey)}`,
    );
    if (!Array.isArray(rows)) throw new ProviderError(NAME, (rows as { detail?: string }).detail ?? `no history for ${inst.symbol}`, 404);
    const candles: Candle[] = rows
      .map((r) => ({
        time: Math.floor(Date.parse(r.date) / 1000),
        open: r.adjOpen ?? r.open,
        high: r.adjHigh ?? r.high,
        low: r.adjLow ?? r.low,
        close: r.adjClose ?? r.close,
        volume: r.adjVolume ?? r.volume ?? 0,
      }))
      .filter((c) => Number.isFinite(c.time) && c.close > 0);
    if (candles.length === 0) throw new ProviderError(NAME, `no history for ${inst.symbol} (${range})`, 404);
    return { symbol: inst.symbol, range, candles, source: NAME, note: 'Adjusted for stock splits and dividends.' };
  }
}
