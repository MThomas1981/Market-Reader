import type { Candle, History, Instrument, Quote } from '../types';
import { isoDate, toWeekly } from '../ranges';
import type { ChartWindow } from '../chart-window';
import { getJSON, ProviderError } from './http';

const NAME = 'Frankfurter (ECB reference rates)';
const BASE = 'https://api.frankfurter.dev/v1';

interface Series { base: string; rates: Record<string, Record<string, number>> }

/** Daily official forex reference rates. Free, no key. Updated once per working day. */
export class FrankfurterProvider {
  readonly name = NAME;

  private async series(from: number, base: string, symbols: string[]): Promise<[string, Record<string, number>][]> {
    const r = await getJSON<Series>(NAME, `${BASE}/${isoDate(from)}..?base=${base}&symbols=${symbols.join(',')}`);
    return Object.entries(r.rates ?? {}).sort(([a], [b]) => a.localeCompare(b));
  }

  /** Quotes for many pairs with one request, using USD as the pivot currency. */
  async quotes(insts: Instrument[]): Promise<Quote[]> {
    if (insts.length === 0) return [];
    const currencies = new Set<string>();
    for (const i of insts) {
      const [b, q] = i.symbol.split('/');
      if (b !== 'USD') currencies.add(b);
      if (q !== 'USD') currencies.add(q);
    }
    const rows = await this.series(Date.now() - 10 * 86_400_000, 'USD', [...currencies]);
    if (rows.length < 2) throw new ProviderError(NAME, 'not enough rate history', 404);
    const rate = (r: Record<string, number>, pair: string) => {
      const [b, q] = pair.split('/');
      const perUsd = (c: string) => (c === 'USD' ? 1 : r[c]);
      return perUsd(q) / perUsd(b);
    };
    const [prevDate, prev] = rows[rows.length - 2];
    const [lastDate, last] = rows[rows.length - 1];
    void prevDate;
    return insts.map((inst) => {
      const price = rate(last, inst.symbol);
      const pc = rate(prev, inst.symbol);
      return {
        symbol: inst.symbol, price, change: price - pc, changePercent: ((price - pc) / pc) * 100,
        open: null, high: null, low: null, previousClose: pc,
        timestamp: Date.parse(`${lastDate}T16:00:00Z`), currency: inst.currency, source: NAME, delayed: true,
      };
    });
  }

  async quote(inst: Instrument): Promise<Quote> {
    const [q] = await this.quotes([inst]);
    return q;
  }

  async history(inst: Instrument, w: ChartWindow): Promise<History> {
    const [base, quote] = inst.symbol.split('/');
    // ECB reference rates start on 4 January 1999 and are published once per business day.
    const rows = await this.series(Math.max(w.from, Date.UTC(1999, 0, 4)), base, [quote]);
    const daily: Candle[] = rows.map(([date, r]) => {
      const v = r[quote];
      return { time: Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000), open: v, high: v, low: v, close: v, volume: 0 };
    });
    if (daily.length === 0) throw new ProviderError(NAME, `no history for ${inst.symbol}`, 404);
    const weekly = w.resolution.timespan === 'week';
    return {
      symbol: inst.symbol, range: w.range, candles: weekly ? toWeekly(daily) : daily, source: NAME,
      note: weekly ? 'Weekly view of the European Central Bank’s daily reference rates.' : 'Daily reference rates from the European Central Bank; currencies have no intraday bars on the free data.',
    };
  }

}
