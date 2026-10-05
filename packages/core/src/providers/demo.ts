import type { Candle, History, Instrument, Profile, Quote } from '../types';
import { isoDate } from '../ranges';
import type { ChartWindow } from '../chart-window';

/**
 * Demo data: deterministic, made-up prices so the app runs with no API keys.
 * Every number it returns is labelled "Demo data" in the UI. It never invents
 * news, company facts or fundamentals.
 */
export const DEMO_SOURCE = 'Demo data';

const FX_LEVELS: Record<string, number> = {
  'EUR/USD': 1.13, 'USD/JPY': 157, 'GBP/USD': 1.3, 'USD/CAD': 1.37,
  'AUD/USD': 0.66, 'USD/CHF': 0.85, 'USD/CNY': 7.15, 'USD/MXN': 18.5,
};

/** Rough orders of magnitude so demo crypto looks plausible; not real prices. */
const CRYPTO_LEVELS: Record<string, number> = {
  'BTC-USD': 60000, 'ETH-USD': 3000, 'SOL-USD': 150, 'XRP-USD': 0.6, 'BNB-USD': 600,
  'DOGE-USD': 0.15, 'ADA-USD': 0.45, 'AVAX-USD': 30, 'LINK-USD': 15, 'LTC-USD': 80,
};

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal from a uniform generator (Box–Muller). */
function normal(r: () => number) {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function basePrice(inst: Instrument): number {
  if (inst.assetClass === 'forex') return FX_LEVELS[inst.symbol] ?? 1 + (hash(inst.symbol) % 100) / 100;
  const h = hash(inst.symbol);
  if (inst.assetClass === 'crypto') return (CRYPTO_LEVELS[inst.symbol] ?? [0.5, 5, 50][h % 3]) * (1 + (h % 37) / 100);
  return 15 + (h % 48500) / 100;
}

function volatility(inst: Instrument) {
  return { crypto: 0.035, forex: 0.005, etf: 0.011, index: 0.01, stock: 0.019 }[inst.assetClass];
}

export class DemoProvider {
  readonly name = DEMO_SOURCE;

  quote(inst: Instrument, now = Date.now()): Quote {
    const base = basePrice(inst);
    const r = rng(hash(`${inst.symbol}|${isoDate(now)}`));
    const pct = normal(r) * volatility(inst) * 100;
    const price = base * (1 + pct / 100);
    const intraday = Math.abs(normal(r)) * volatility(inst) * 0.6;
    return {
      symbol: inst.symbol,
      price,
      change: price - base,
      changePercent: pct,
      open: base * (1 + normal(r) * volatility(inst) * 0.2),
      high: Math.max(price, base) * (1 + intraday),
      low: Math.min(price, base) * (1 - intraday),
      previousClose: base,
      timestamp: now,
      currency: inst.currency,
      source: DEMO_SOURCE,
      delayed: false,
    };
  }

  /**
   * Made-up OHLCV bars for a chart window, at the window's resolution and trading hours.
   * Prices are generated backwards from today's demo price, so the visible bars stay identical
   * however much lookback buffer is requested before them.
   */
  history(inst: Instrument, w: ChartWindow, now = Date.now()): History {
    const end = this.quote(inst, now).price;
    const times = barTimes(w, now);
    const r = rng(hash(`${inst.symbol}|${w.resolution.label}|${isoDate(now)}`));
    const dailyVol = volatility(inst);
    const tradingSecondsPerDay = w.hours === 'us-equity' && w.resolution.seconds < 86_400 ? 390 * 60 : 86_400;
    const stepDays = w.resolution.timespan === 'week' ? 5 : w.resolution.seconds / tradingSecondsPerDay;
    const vol = dailyVol * Math.sqrt(stepDays);
    const drift = 0.0003 * stepDays;
    const n = times.length;
    const closes = new Array<number>(n);
    const opens = new Array<number>(n);
    const wicks = new Array<number>(n);
    const vols = new Array<number>(n);
    closes[n - 1] = end;
    for (let i = n - 1; i >= 0; i--) {
      if (i > 0) closes[i - 1] = closes[i] / (1 + drift + normal(r) * vol);
      wicks[i] = Math.abs(normal(r)) * vol * 0.5;
      vols[i] = Math.round((2e6 + r() * 8e6) * stepDays);
      opens[i] = i > 0 ? closes[i - 1] : closes[0] * (1 + normal(r) * vol * 0.3);
    }
    const candles: Candle[] = times.map((time, i) => ({
      time,
      open: opens[i],
      high: Math.max(opens[i], closes[i]) * (1 + wicks[i]),
      low: Math.min(opens[i], closes[i]) * (1 - wicks[i]),
      close: closes[i],
      volume: inst.assetClass === 'forex' ? 0 : vols[i],
    }));
    return { symbol: inst.symbol, range: w.range, candles, source: DEMO_SOURCE };
  }


  profile(inst: Instrument): Profile {
    return {
      symbol: inst.symbol,
      name: inst.name,
      exchange: inst.exchange,
      industry: null,
      website: null,
      logo: null,
      description: null,
      stats: { marketCap: null, peRatio: null, dividendYield: null, week52High: null, week52Low: null, avgVolume: null, beta: null },
      source: DEMO_SOURCE,
    };
  }
}

/** Bar start times (Unix seconds), oldest first, following the window's trading hours. */
function barTimes(w: ChartWindow, now: number): number[] {
  const DAY = 86_400_000;
  const tradesOn = (dayMs: number) => w.hours === 'always' || ![0, 6].includes(new Date(dayMs).getUTCDay());
  const start = w.from || now - 20 * 365 * DAY;
  const firstDay = Math.floor(start / DAY) * DAY;
  const out: number[] = [];
  const step = w.resolution.seconds * 1000;
  if (w.resolution.timespan === 'week') {
    for (let t = Math.floor(now / step) * step; t >= firstDay; t -= step) out.unshift(Math.floor(t / 1000));
    return out;
  }
  for (let d = firstDay; d <= now; d += DAY) {
    if (!tradesOn(d)) continue;
    if (w.resolution.timespan === 'day') {
      out.push(Math.floor(d / 1000));
      continue;
    }
    // Intraday: stocks trade 9:30–16:00 New York (about 13:30–20:00 UTC); crypto all day.
    const [open, close] = w.hours === 'us-equity' ? [d + 13.5 * 3_600_000, d + 20 * 3_600_000] : [d, d + DAY];
    for (let t = open; t < close && t <= now; t += step) if (t >= start) out.push(Math.floor(t / 1000));
  }
  return out;
}
