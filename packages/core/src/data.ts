import type { EarningsResult, History, Instrument, MarketOverview, NewsItem, Profile, Quote, Range, SearchResult } from './types';
import { TTLCache } from './cache';
import { CRYPTO, FOREX, INDEX_PROXIES, UNIVERSE, US_STOCKS, instrumentFor } from './universe';
import { CoinGeckoProvider } from './providers/coingecko';
import { DEMO_SOURCE, DemoProvider } from './providers/demo';
import { FinnhubProvider } from './providers/finnhub';
import { FrankfurterProvider } from './providers/frankfurter';
import { ProviderError, mapLimit } from './providers/http';
import { newYorkClock, usMarketSession, type MarketSession, type MarketStatus } from './market-hours';
import { chartWindow, firstVisibleIndex, type ChartWindow } from './chart-window';
import { MassiveProvider } from './providers/massive';
import { TiingoProvider } from './providers/tiingo';
import { KrakenProvider } from './providers/kraken';

export interface DataConfig {
  finnhubKey?: string;
  massiveKey?: string;
  massiveBaseUrl?: string;
  coingeckoKey?: string;
  /** Tiingo: 5-year and all-time history for US stocks and ETFs */
  tiingoKey?: string;
  /** Use demo data everywhere (offline development). */
  demoOnly?: boolean;
}

const SEC = 1000;
const MIN = 60 * SEC;

/**
 * The one place that knows which provider supplies which asset.
 * Apps call this; swapping or adding a provider never touches UI code.
 *
 * Routing:
 *   US stocks/ETFs  quote, profile, news, earnings → Finnhub   history → Massive
 *   Crypto          everything → CoinGecko
 *   Forex           everything → Frankfurter (ECB daily reference rates)
 *   International   demo data until a paid source is added
 * Anything without a configured key falls back to clearly labelled demo prices.
 */
export class MarketData {
  private cache = new TTLCache();
  private demo = new DemoProvider();
  private finnhub?: FinnhubProvider;
  private massive?: MassiveProvider;
  private coingecko?: CoinGeckoProvider;
  private frankfurter?: FrankfurterProvider;
  private tiingo?: TiingoProvider;
  private kraken?: KrakenProvider;

  private demoOnly = false;
  /** Last real series per chart, served instead of made-up prices while a source is rate-limited. */
  private lastGoodHistory = new Map<string, { at: number; history: History }>();

  constructor(cfg: DataConfig = {}) {
    this.demoOnly = !!cfg.demoOnly;
    if (cfg.demoOnly) return;
    if (cfg.finnhubKey) this.finnhub = new FinnhubProvider(cfg.finnhubKey);
    if (cfg.massiveKey) this.massive = new MassiveProvider(cfg.massiveKey, cfg.massiveBaseUrl);
    this.coingecko = new CoinGeckoProvider(cfg.coingeckoKey);
    this.frankfurter = new FrankfurterProvider();
    this.kraken = new KrakenProvider();
    if (cfg.tiingoKey) this.tiingo = new TiingoProvider(cfg.tiingoKey);
  }

  /** Whether the US stock market is open right now. Finnhub when available, otherwise the built-in calendar. */
  async marketStatus(): Promise<MarketStatus> {
    return this.cache.wrap('market-status', MIN, async () => {
      const calendar = usMarketSession();
      if (!this.finnhub) return calendar;
      try {
        const s = await this.finnhub.marketStatus();
        const session: MarketSession = s.isOpen ? 'regular'
          : s.session === 'pre-market' ? 'pre-market'
          : s.session === 'post-market' ? 'after-hours' : 'closed';
        return { ...calendar, session, isOpen: s.isOpen, holiday: s.holiday ?? calendar.holiday, source: 'Finnhub' };
      } catch {
        return calendar;
      }
    });
  }

  /**
   * Asks each configured source for one real price right now (no cache) and reports what happened,
   * so it is obvious when a key is wrong or a free plan's limit is hit instead of prices silently going stale.
   */
  async health(): Promise<{ source: string; covers: string; ok: boolean; detail: string; ms: number }[]> {
    const probe = async (source: string, covers: string, configured: boolean, run: () => Promise<string>) => {
      if (!configured) return { source, covers, ok: false, detail: 'No API key set, so demo prices are used', ms: 0 };
      const t0 = Date.now();
      try {
        return { source, covers, ok: true, detail: await run(), ms: Date.now() - t0 };
      } catch (e) {
        return { source, covers, ok: false, detail: e instanceof Error ? e.message : 'failed', ms: Date.now() - t0 };
      }
    };
    const spy = instrumentFor('SPY');
    return Promise.all([
      probe('Finnhub', 'US stock quotes, news, real-time trades', !!this.finnhub, async () => {
        const q = await this.finnhub!.quote(spy);
        return `SPY ${q.price.toFixed(2)}, last trade ${new Date(q.timestamp).toISOString()}`;
      }),
      probe('Massive', 'US stock charts', !!this.massive, async () => {
        const h = await this.massive!.history(spy, chartWindow('1M', 'etf'));
        const last = h.candles[h.candles.length - 1];
        return last ? `${h.candles.length} hourly bars, latest ${new Date(last.time * 1000).toISOString().slice(0, 10)}` : 'no bars returned';
      }),
      probe('Tiingo', 'US stock 5-year and all-time charts', !!this.tiingo, async () => {
        const h = await this.tiingo!.history(spy, chartWindow('MAX', 'etf'));
        return `${h.candles.length} weekly bars since ${new Date(h.candles[0].time * 1000).toISOString().slice(0, 10)}`;
      }),
      probe('Kraken', 'Crypto 5-year and all-time charts', !!this.kraken, async () => {
        const h = await this.kraken!.history(instrumentFor('BTC-USD'), chartWindow('MAX', 'crypto'));
        return `${h.candles.length} weekly bars since ${new Date(h.candles[0].time * 1000).toISOString().slice(0, 10)}`;
      }),
      probe('CoinGecko', 'Crypto', !!this.coingecko, async () => `BTC ${(await this.coingecko!.quote(instrumentFor('BTC-USD'))).price.toFixed(2)}`),
      probe('Frankfurter', 'Currencies', !!this.frankfurter, async () => `EUR/USD ${(await this.frankfurter!.quote(instrumentFor('EUR/USD'))).price.toFixed(4)}`),
    ]);
  }

  /** Which sources are live, for the settings/status screen. */
  status() {
    return {
      usQuotes: this.finnhub ? 'Finnhub' : 'Demo data',
      usHistory: this.massive ? 'Massive' : 'Demo data',
      crypto: this.coingecko ? 'CoinGecko' : 'Demo data',
      forex: this.frankfurter ? 'Frankfurter' : 'Demo data',
      international: 'Demo data',
      news: this.finnhub ? 'Finnhub' : 'Not configured',
      longHistory: this.tiingo ? 'Tiingo' : this.massive ? 'Massive (about 2 years)' : 'Demo data',
      cryptoLongHistory: this.kraken ? 'Kraken' : 'Demo data',
    };
  }

  instrument(symbol: string): Instrument {
    return instrumentFor(symbol);
  }

  private isUS(i: Instrument) {
    return (i.assetClass === 'stock' || i.assetClass === 'etf' || i.assetClass === 'index') && i.country === 'US';
  }

  /**
   * Runs a live call and, if the source is down, rate-limited or the key is wrong, returns labelled demo data instead
   * so the app keeps working in a classroom demo. A 404 (symbol not found) is still reported as an error.
   */
  private async orDemo<T>(live: () => Promise<T>, demo: () => T): Promise<T> {
    try {
      return await live();
    } catch (e) {
      if (e instanceof ProviderError && e.status === 404) throw e;
      return demo();
    }
  }

  async quote(symbol: string): Promise<Quote> {
    const inst = instrumentFor(symbol);
    const demo = () => this.demo.quote(inst);
    return this.cache.wrap(`q:${inst.symbol}`, inst.assetClass === 'forex' ? 10 * MIN : inst.assetClass === 'crypto' ? 15 * SEC : 5 * SEC, async () => {
      if (inst.assetClass === 'crypto' && this.coingecko) return this.orDemo(() => this.coingecko!.quote(inst), demo);
      if (inst.assetClass === 'forex' && this.frankfurter) return this.orDemo(() => this.frankfurter!.quote(inst), demo);
      if (this.isUS(inst) && this.finnhub) return this.orDemo(() => this.finnhub!.quote(inst), demo);
      return demo();
    });
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    const insts = symbols.map(instrumentFor);
    const crypto = insts.filter((i) => i.assetClass === 'crypto');
    const fx = insts.filter((i) => i.assetClass === 'forex');
    const rest = insts.filter((i) => i.assetClass !== 'crypto' && i.assetClass !== 'forex');
    const [c, f, r] = await Promise.all([
      this.coingecko && crypto.length
        ? this.cache.wrap(`qs:c:${crypto.map((i) => i.symbol).join(',')}`, 15 * SEC, () => this.coingecko!.quotes(crypto)).catch(() => crypto.map((i) => this.demo.quote(i)))
        : Promise.resolve(crypto.map((i) => this.demo.quote(i))),
      this.frankfurter && fx.length
        ? this.cache.wrap(`qs:f:${fx.map((i) => i.symbol).join(',')}`, 10 * MIN, () => this.frankfurter!.quotes(fx)).catch(() => fx.map((i) => this.demo.quote(i)))
        : Promise.resolve(fx.map((i) => this.demo.quote(i))),
      mapLimit(rest, 4, (i) => this.quote(i.symbol)),
    ]);
    const all = [...c, ...f, ...r.filter((q): q is Quote => q !== null)];
    const order = new Map(insts.map((i, n) => [i.symbol, n]));
    return all.sort((a, b) => (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0));
  }

  /**
   * Price history for a chart at the range's bar size (see chart-window.ts).
   * `lookback` asks for that many extra bars before the visible range, so an indicator such as a
   * 200-period moving average already has a value at the first visible bar. The result holds every
   * bar plus `visibleFrom`; with no lookback it holds only the visible bars.
   */
  async history(symbol: string, range: Range, lookback = 0): Promise<History> {
    const inst = instrumentFor(symbol);
    const w = chartWindow(range, inst.assetClass, lookback);
    // Every request up to 200 bars of lookback shares one fetched series (one provider call per chart range),
    // which keeps free plans with tight limits (Massive: 5 calls a minute) from running out.
    const fetchBucket = Math.max(200, w.lookbackBars);
    const fw = fetchBucket === w.lookbackBars ? w : chartWindow(range, inst.assetClass, fetchBucket);
    const key = `h:${inst.symbol}:${range}:${fetchBucket}`;
    const ttl = range === '1D' || range === '5D' ? 2 * MIN : range === '1M' ? 10 * MIN : range === '5Y' || range === 'MAX' ? 6 * 60 * MIN : 30 * MIN;
    const fallback = (h: History) => h.source === DEMO_SOURCE && !this.demoOnly;
    let h = await this.cache.wrap(key, ttl, () => this.fetchHistory(inst, fw), (v) => (fallback(v) ? 20 * SEC : ttl));
    if (fallback(h)) {
      // A source refused (usually a free-plan rate limit): show the last real prices rather than made-up ones.
      const good = this.lastGoodHistory.get(key);
      if (good) {
        const at = new Date(good.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' });
        h = { ...good.history, note: [good.history.note, `${good.history.source} is busy (free plan limit), so this chart is from ${at} and will refresh shortly.`].filter(Boolean).join(' ') };
      }
    } else {
      if (this.lastGoodHistory.size > 500) this.lastGoodHistory.delete(this.lastGoodHistory.keys().next().value!);
      this.lastGoodHistory.set(key, { at: Date.now(), history: h });
    }
    // Today's bar is added after the cache, so it always reflects the latest quote.
    if (this.isUS(inst) && h.source === 'Massive' && w.resolution.timespan === 'day') h = await this.withTodaysBar(inst, h);
    const i = firstVisibleIndex(h.candles, w);
    h = this.explainCoverage({ ...h, resolution: w.resolution.label }, w, i);
    // Return the visible bars plus only as much buffer as was asked for.
    const start = Math.max(0, i - w.lookbackBars);
    return { ...h, candles: h.candles.slice(start), visibleFrom: h.candles[i]?.time };
  }

  /** Pick the source for a chart window. */
  private async fetchHistory(inst: Instrument, w: ChartWindow): Promise<History> {
    const demo = () => this.demo.history(inst, w);
    // Like orDemo, but the chart says why it fell back to made-up prices.
    const orDemoWhy = async (live: () => Promise<History>): Promise<History> => {
      try {
        return await live();
      } catch (e) {
        if (e instanceof ProviderError && e.status === 404) throw e;
        return { ...demo(), note: `Live prices unavailable (${e instanceof Error ? e.message : 'error'}), so this chart shows made-up demo data.` };
      }
    };
    if (inst.assetClass === 'crypto') {
      // Kraken has real OHLC bars and needs no key. Its 720-bar limit is too short only for 1M of hourly bars.
      if (this.kraken && w.resolution.timespan !== 'hour') {
        try {
          return await this.kraken.history(inst, w);
        } catch {
          /* not listed on Kraken: CoinGecko instead */
        }
      }
      return this.coingecko ? orDemoWhy(() => this.coingecko!.history(inst, w)) : demo();
    }
    if (inst.assetClass === 'forex') return this.frankfurter ? orDemoWhy(() => this.frankfurter!.history(inst, w)) : demo();
    if (this.isUS(inst)) {
      // Massive's free plan holds about 2 years; daily or weekly windows that reach further use Tiingo.
      const daily = w.resolution.seconds >= 86_400;
      const beyondMassive = w.from < Date.now() - 700 * 86_400_000;
      if (this.tiingo && daily && (beyondMassive || !this.massive)) {
        try {
          return await this.tiingo.history(inst, w);
        } catch (e) {
          if (!this.massive) return orDemoWhy(() => Promise.reject(e));
        }
      }
      if (this.massive) {
        const massive = this.massive;
        return orDemoWhy(async () => {
          try {
            return await massive.history(inst, w);
          } catch (e) {
            if (this.tiingo && daily && !(e instanceof ProviderError && e.status === 404)) return this.tiingo.history(inst, w);
            throw e;
          }
        });
      }
    }
    return demo();
  }

  /** Say plainly when a free plan returned less history than the range asks for. */
  private explainCoverage(h: History, w: ChartWindow, firstVisible: number): History {
    if (w.resolution.timespan !== 'day' && w.resolution.timespan !== 'week') return h;
    const first = h.candles[firstVisible]?.time ?? 0;
    const since = new Date(first * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const short = w.visibleStart === null ? h.source === 'Massive' || h.source === 'CoinGecko' : first * 1000 > w.visibleStart + 10 * 86_400_000;
    if (!short) return h;
    if (h.source === 'Massive')
      return { ...h, note: `Showing history since ${since}: Massive's free plan covers about 2 years. Add a free Tiingo key (TIINGO_API_KEY) for ${w.range === 'MAX' ? 'all history back to the listing date' : `the full ${w.range}`}.` };
    if (h.source === 'CoinGecko')
      return { ...h, note: `Showing history since ${since}: CoinGecko's free plan covers 1 year, and this coin isn't on Kraken.` };
    return { ...h, note: `Showing history since ${since}, when ${h.source}'s records for ${h.symbol} begin.` };
  }

  /**
   * Massive's free plan ends daily history at the previous trading day. Add today's bar from the live
   * quote (open, high, low and latest price), so charts and analysis end at the same price as the quote.
   */
  private async withTodaysBar(inst: Instrument, h: History): Promise<History> {
    const last = h.candles[h.candles.length - 1];
    if (!last) return h;
    try {
      const q = await this.quote(inst.symbol);
      if (q.source === 'Demo data') return h;
      const day = (ms: number) => Date.parse(`${newYorkClock(ms).date}T00:00:00Z`);
      const days = Math.round((day(q.timestamp) - day(last.time * 1000)) / 86_400_000);
      if (days < 1) return h;
      const bar = {
        time: last.time + days * 86_400,
        open: q.open ?? q.price,
        high: Math.max(q.high ?? q.price, q.price),
        low: Math.min(q.low ?? q.price, q.price),
        close: q.price,
        volume: 0,
      };
      return { ...h, candles: [...h.candles, bar] };
    } catch {
      return h;
    }
  }

  async profile(symbol: string): Promise<Profile> {
    const inst = instrumentFor(symbol);
    return this.cache.wrap(`p:${inst.symbol}`, 6 * 60 * MIN, async () => {
      if (inst.assetClass === 'crypto' && this.coingecko) return this.coingecko.profile(inst).catch(() => this.demo.profile(inst));
      if (this.isUS(inst) && this.finnhub) return this.orDemo(() => this.finnhub!.profile(inst), () => this.demo.profile(inst));
      return this.demo.profile(inst);
    });
  }

  /** News for a symbol, or general market news when symbol is omitted. Empty when no news source is configured. */
  async news(symbol?: string, limit = 20): Promise<NewsItem[]> {
    if (!this.finnhub) return [];
    const inst = symbol ? instrumentFor(symbol) : null;
    if (inst && !this.isUS(inst)) return [];
    return this.cache.wrap(`n:${inst?.symbol ?? 'market'}`, 10 * MIN, () => this.finnhub!.news(inst, limit));
  }

  async earnings(symbol: string): Promise<EarningsResult[]> {
    const inst = instrumentFor(symbol);
    if (!this.finnhub || !this.isUS(inst) || inst.assetClass !== 'stock') return [];
    return this.cache.wrap(`e:${inst.symbol}`, 6 * 60 * MIN, () => this.finnhub!.earnings(inst));
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const local: SearchResult[] = UNIVERSE.filter(
      (i) => i.symbol.toLowerCase().replace('/', '').startsWith(q.replace('/', '')) || i.name.toLowerCase().includes(q),
    )
      .slice(0, 10)
      .map((i) => ({ symbol: i.symbol, name: i.name, assetClass: i.assetClass, exchange: i.exchange }));
    if (!this.finnhub || q.length < 2) return local;
    const remote = await this.cache.wrap(`s:${q}`, 60 * MIN, () => this.finnhub!.search(q)).catch(() => []);
    const seen = new Set(local.map((r) => r.symbol));
    return [...local, ...remote.filter((r) => !seen.has(r.symbol) && !r.symbol.includes(':'))].slice(0, 15);
  }

  async overview(): Promise<MarketOverview> {
    return this.cache.wrap('overview', 2 * MIN, async () => {
      const [indexes, stocks, crypto, forex] = await Promise.all([
        this.quotes(INDEX_PROXIES.map((i) => i.symbol)),
        this.quotes(US_STOCKS.map((i) => i.symbol)),
        this.quotes(CRYPTO.slice(0, 6).map((i) => i.symbol)),
        this.quotes(FOREX.slice(0, 6).map((i) => i.symbol)),
      ]);
      const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
      return {
        indexes,
        gainers: sorted.filter((q) => q.changePercent > 0).slice(0, 5),
        losers: sorted.filter((q) => q.changePercent < 0).reverse().slice(0, 5),
        crypto,
        forex,
        updatedAt: Date.now(),
      };
    });
  }
}
