import type { AssetClass, EarningsResult, Instrument, NewsItem, Profile, Quote, SearchResult } from '../types';
import { isoDate } from '../ranges';
import { getJSON, ProviderError } from './http';
import { instrumentFor } from '../universe';

const BASE = 'https://finnhub.io/api/v1';
const NAME = 'Finnhub';

interface FinnhubQuote { c: number; d: number | null; dp: number | null; h: number; l: number; o: number; pc: number; t: number }
interface FinnhubProfile { name?: string; exchange?: string; finnhubIndustry?: string; weburl?: string; logo?: string; marketCapitalization?: number }
interface FinnhubMetric { metric?: Record<string, number | null> }
interface FinnhubNews { id: number; headline: string; summary: string; source: string; url: string; datetime: number; related?: string }
interface FinnhubSearch { result?: { description: string; displaySymbol: string; symbol: string; type: string }[] }
interface FinnhubEarnings { period: string; actual: number | null; estimate: number | null; surprisePercent: number | null }

export class FinnhubProvider {
  readonly name = NAME;
  constructor(private apiKey: string) {}

  private get<T>(path: string, params: Record<string, string>) {
    const qs = new URLSearchParams({ ...params, token: this.apiKey });
    return getJSON<T>(NAME, `${BASE}${path}?${qs}`);
  }

  /** US market open/closed right now, from Finnhub's exchange calendar. */
  async marketStatus(): Promise<{ isOpen: boolean; session: string | null; holiday: string | null }> {
    const s = await this.get<{ isOpen: boolean; session: string | null; holiday: string | null }>('/stock/market-status', { exchange: 'US' });
    return { isOpen: !!s.isOpen, session: s.session ?? null, holiday: s.holiday ?? null };
  }

  async quote(inst: Instrument): Promise<Quote> {
    const q = await this.get<FinnhubQuote>('/quote', { symbol: inst.symbol });
    if (!q || (q.c === 0 && q.t === 0)) throw new ProviderError(NAME, `no quote for ${inst.symbol}`, 404);
    return {
      symbol: inst.symbol,
      price: q.c,
      change: q.d ?? q.c - q.pc,
      changePercent: q.dp ?? (q.pc ? ((q.c - q.pc) / q.pc) * 100 : 0),
      open: q.o || null,
      high: q.h || null,
      low: q.l || null,
      previousClose: q.pc || null,
      timestamp: q.t * 1000,
      currency: inst.currency,
      source: NAME,
      delayed: false,
    };
  }

  async profile(inst: Instrument): Promise<Profile> {
    const [p, m] = await Promise.all([
      this.get<FinnhubProfile>('/stock/profile2', { symbol: inst.symbol }).catch(() => ({} as FinnhubProfile)),
      this.get<FinnhubMetric>('/stock/metric', { symbol: inst.symbol, metric: 'all' }).catch(() => ({} as FinnhubMetric)),
    ]);
    const metric = m.metric ?? {};
    const num = (k: string) => (typeof metric[k] === 'number' ? (metric[k] as number) : null);
    return {
      symbol: inst.symbol,
      name: p.name || inst.name,
      exchange: p.exchange || inst.exchange,
      industry: p.finnhubIndustry || null,
      website: p.weburl || null,
      logo: p.logo || null,
      description: null,
      stats: {
        marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : null,
        peRatio: num('peTTM') ?? num('peBasicExclExtraTTM'),
        dividendYield: num('dividendYieldIndicatedAnnual'),
        week52High: num('52WeekHigh'),
        week52Low: num('52WeekLow'),
        avgVolume: num('10DayAverageTradingVolume') !== null ? (num('10DayAverageTradingVolume') as number) * 1e6 : null,
        beta: num('beta'),
      },
      source: NAME,
    };
  }

  async news(inst: Instrument | null, limit = 20): Promise<NewsItem[]> {
    const now = Date.now();
    const items = inst
      ? await this.get<FinnhubNews[]>('/company-news', { symbol: inst.symbol, from: isoDate(now - 7 * 86_400_000), to: isoDate(now) })
      : await this.get<FinnhubNews[]>('/news', { category: 'general' });
    return (items ?? [])
      .filter((n) => n.headline && n.url)
      .slice(0, limit)
      .map((n) => ({
        id: String(n.id),
        headline: n.headline,
        summary: n.summary,
        source: n.source,
        url: n.url,
        publishedAt: n.datetime * 1000,
        symbols: n.related ? n.related.split(',').filter(Boolean) : inst ? [inst.symbol] : [],
      }));
  }

  async search(query: string): Promise<SearchResult[]> {
    const r = await this.get<FinnhubSearch>('/search', { q: query });
    return (r.result ?? []).slice(0, 15).map((x) => ({
      symbol: x.symbol,
      name: x.description,
      assetClass: mapType(x.type),
      // BRK.B is a US share class; only real foreign suffixes (SHOP.TO, 7203.T) are international.
      exchange: instrumentFor(x.symbol).country === 'US' ? 'US' : instrumentFor(x.symbol).exchange,
    }));
  }

  async earnings(inst: Instrument): Promise<EarningsResult[]> {
    const r = await this.get<FinnhubEarnings[]>('/stock/earnings', { symbol: inst.symbol });
    return (r ?? []).map((e) => ({ period: e.period, actual: e.actual, estimate: e.estimate, surprisePercent: e.surprisePercent }));
  }
}

function mapType(t: string): AssetClass {
  if (/ETP|ETF/i.test(t)) return 'etf';
  return 'stock';
}
