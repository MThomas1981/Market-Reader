import type { Candle, History, Instrument, Profile, Quote, Range } from '../types';
import type { ChartWindow } from '../chart-window';
import { getJSON, ProviderError } from './http';

const NAME = 'CoinGecko';
const BASE = 'https://api.coingecko.com/api/v3';

interface Market {
  id: string; current_price: number; price_change_24h: number | null; price_change_percentage_24h: number | null;
  high_24h: number | null; low_24h: number | null; last_updated: string; market_cap: number | null; total_volume: number | null;
}
interface Coin {
  description?: { en?: string }; links?: { homepage?: string[] }; image?: { small?: string };
  market_data?: { market_cap?: { usd?: number }; total_volume?: { usd?: number } };
}

/** Crypto quotes and history. Works without a key (lower limits); a free Demo key raises them. */
export class CoinGeckoProvider {
  readonly name = NAME;
  constructor(private apiKey?: string) {}

  private get<T>(path: string) {
    return getJSON<T>(NAME, `${BASE}${path}`, this.apiKey ? { 'x-cg-demo-api-key': this.apiKey } : {});
  }

  private idFor(inst: Instrument) {
    return inst.providerIds?.coingecko ?? inst.symbol.replace('-USD', '').toLowerCase();
  }

  async quotes(insts: Instrument[]): Promise<Quote[]> {
    if (insts.length === 0) return [];
    const ids = insts.map((i) => this.idFor(i));
    const rows = await this.get<Market[]>(`/coins/markets?vs_currency=usd&ids=${ids.join(',')}`);
    return insts.flatMap((inst) => {
      const m = rows.find((r) => r.id === this.idFor(inst));
      if (!m) return [];
      const change = m.price_change_24h ?? 0;
      return [{
        symbol: inst.symbol,
        price: m.current_price,
        change,
        changePercent: m.price_change_percentage_24h ?? 0,
        open: null,
        high: m.high_24h,
        low: m.low_24h,
        previousClose: m.current_price - change,
        timestamp: Date.parse(m.last_updated) || Date.now(),
        currency: 'USD',
        source: NAME,
        delayed: false,
      }];
    });
  }

  async quote(inst: Instrument): Promise<Quote> {
    const [q] = await this.quotes([inst]);
    if (!q) throw new ProviderError(NAME, `no quote for ${inst.symbol}`, 404);
    return q;
  }

  /**
   * Price history built from CoinGecko's market_chart points. The free API picks the point spacing from the
   * span asked for (1 day: every 5 minutes, up to 90 days: hourly, longer: daily) and covers up to 365 days.
   * Points are grouped into bars of the window's resolution (or the finest spacing available).
   */
  async history(inst: Instrument, w: ChartWindow): Promise<History> {
    const DAY = 86_400_000;
    const days = Math.min(365, Math.max(1, Math.ceil((w.to - w.from) / DAY)));
    const r = await this.get<{ prices: [number, number][]; total_volumes?: [number, number][] }>(
      `/coins/${this.idFor(inst)}/market_chart?vs_currency=usd&days=${days}${days > 90 ? '&interval=daily' : ''}`,
    );
    const spacing = days <= 1 ? 300 : days <= 90 ? 3_600 : 86_400;
    const bucket = Math.max(w.resolution.seconds, spacing);
    const candles: Candle[] = [];
    let prevClose: number | null = null;
    for (const [t, p] of r.prices ?? []) {
      const time = Math.floor(t / 1000 / bucket) * bucket;
      const last = candles[candles.length - 1];
      if (last && last.time === time) {
        last.high = Math.max(last.high, p);
        last.low = Math.min(last.low, p);
        last.close = p;
      } else {
        const open = prevClose ?? p;
        candles.push({ time, open, high: Math.max(open, p), low: Math.min(open, p), close: p, volume: 0 });
      }
      prevClose = p;
    }
    const visible = candles.filter((c) => c.time * 1000 >= w.from - bucket * 1000);
    if (visible.length === 0) throw new ProviderError(NAME, `no history for ${inst.symbol}`, 404);
    return { symbol: inst.symbol, range: w.range, candles: visible, source: NAME };
  }


  async profile(inst: Instrument): Promise<Profile> {
    const c = await this.get<Coin>(`/coins/${this.idFor(inst)}?localization=false&tickers=false&community_data=false&developer_data=false`);
    const description = c.description?.en?.replace(/<[^>]+>/g, '').split(/\n\s*\n/)[0]?.trim() || null;
    return {
      symbol: inst.symbol,
      name: inst.name,
      exchange: 'Crypto',
      industry: 'Cryptocurrency',
      website: c.links?.homepage?.find(Boolean) ?? null,
      logo: c.image?.small ?? null,
      description,
      stats: {
        marketCap: c.market_data?.market_cap?.usd ?? null,
        peRatio: null, dividendYield: null, week52High: null, week52Low: null,
        avgVolume: c.market_data?.total_volume?.usd ?? null,
        beta: null,
      },
      source: NAME,
    };
  }
}
