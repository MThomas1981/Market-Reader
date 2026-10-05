import type { Candle } from './types';
import { longRunWeight } from './cagr';

/**
 * Price range estimates, 1 day to 6 months.
 *
 * Method: a lognormal random-walk model fitted to recent daily returns.
 *   - Volatility (sigma) is the standard deviation of daily log returns.
 *   - Drift (the expected trend) blends the past year's average daily log return with the stock's
 *     long-run CAGR (see cagr.ts): 60% long-run weight with 5+ years of history, 45% with 3, 25% with 1.
 *     The blend is then shrunk halfway toward zero, because past trends are a weak guide to future ones.
 *   - Ranges are the 25–75% (likely) and 10–90% (wide) quantiles of that model.
 * A backtest replays the same method over past data and reports how often the
 * real price actually ended inside the 10–90% range (ideal: about 80%).
 *
 * These are statistical ranges built from past price behaviour. They are not
 * predictions of news, earnings or events, and they are not financial advice.
 */

export type Horizon = '1D' | '1W' | '1M' | '3M' | '6M';
export const HORIZONS: Horizon[] = ['1D', '1W', '1M', '3M', '6M'];

/** Horizon length in trading periods. Crypto trades every calendar day. */
export function horizonPeriods(h: Horizon, everyDay = false): number {
  return everyDay
    ? { '1D': 1, '1W': 7, '1M': 30, '3M': 91, '6M': 182 }[h]
    : { '1D': 1, '1W': 5, '1M': 21, '3M': 63, '6M': 126 }[h];
}

export interface ForecastPoint {
  horizon: Horizon;
  periods: number;
  /** Approximate calendar date the horizon ends, YYYY-MM-DD */
  targetDate: string;
  median: number;
  likelyLow: number;
  likelyHigh: number;
  wideLow: number;
  wideHigh: number;
  /** Chance the price ends above today's, 0–1 */
  probUp: number;
  medianChangePct: number;
}

export interface ForecastResult {
  lastPrice: number;
  lastDate: string;
  dailyVolatility: number;
  annualVolatility: number;
  dailyDrift: number;
  sampleSize: number;
  points: ForecastPoint[];
  method: string;
  /** Inputs to the trend: past-year growth, long-run CAGR and the weight given to the long run */
  trend: { pastYearAnnualPct: number; longRunCagrPct: number | null; longRunWeight: number; projectedAnnualPct: number };
}

const Z25 = 0.6744897501960817;
const Z10 = 1.2815515655446004;
const DRIFT_SHRINK = 0.5;

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

function meanStd(xs: number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

function band(price: number, mu: number, sigma: number, n: number) {
  const m = mu * n;
  const s = sigma * Math.sqrt(n);
  return {
    median: price * Math.exp(m),
    likelyLow: price * Math.exp(m - Z25 * s),
    likelyHigh: price * Math.exp(m + Z25 * s),
    wideLow: price * Math.exp(m - Z10 * s),
    wideHigh: price * Math.exp(m + Z10 * s),
    probUp: s > 0 ? normCdf(m / s) : 0.5,
  };
}

function addDays(isoDay: string, periods: number, everyDay: boolean): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  let left = periods;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (everyDay || (wd !== 0 && wd !== 6)) left--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Forecast ranges from daily candles (oldest first). Needs at least 30 daily bars;
 * about a year (250+) gives steadier estimates.
 */
export function forecast(
  candles: Candle[],
  horizons: Horizon[] = HORIZONS,
  opts: { everyDay?: boolean; longRun?: { cagrPct: number | null; basisYears: number | null } } = {},
): ForecastResult {
  const closes = candles.map((c) => c.close);
  const rets = logReturns(closes);
  if (rets.length < 29) throw new Error('Not enough price history to estimate a range (need at least 30 days).');
  const { mean, std } = meanStd(rets);
  const perYear = opts.everyDay ? 365 : 252;
  // Trend: blend the past year's drift with the long-run CAGR, then shrink toward zero.
  const longRunPct = opts.longRun?.cagrPct ?? null;
  const w = longRunPct !== null && Number.isFinite(longRunPct) ? longRunWeight(opts.longRun?.basisYears ?? null) : 0;
  const longDaily = w > 0 ? Math.log(1 + longRunPct! / 100) / perYear : 0;
  const mu = ((1 - w) * mean + w * longDaily) * DRIFT_SHRINK;
  const last = closes[closes.length - 1];
  const lastDate = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10);
  return {
    lastPrice: last,
    lastDate,
    dailyVolatility: std,
    annualVolatility: std * Math.sqrt(perYear),
    dailyDrift: mu,
    sampleSize: rets.length,
    method: w > 0
      ? `Lognormal model fitted to daily returns; trend blends the past year with the long-run CAGR (${Math.round(w * 100)}% long-run weight), then shrunk 50% toward zero.`
      : 'Lognormal model fitted to daily returns; trend shrunk 50% toward zero (no long-run CAGR available).',
    trend: {
      pastYearAnnualPct: (Math.exp(mean * perYear) - 1) * 100,
      longRunCagrPct: longRunPct,
      longRunWeight: w,
      projectedAnnualPct: (Math.exp(mu * perYear) - 1) * 100,
    },
    points: horizons.map((h) => {
      const n = horizonPeriods(h, opts.everyDay);
      const b = band(last, mu, std, n);
      return { horizon: h, periods: n, targetDate: addDays(lastDate, n, !!opts.everyDay), ...b, medianChangePct: (b.median / last - 1) * 100 };
    }),
  };
}

export interface BacktestResult {
  horizon: Horizon;
  /** Share of past forecasts where the real price ended inside the 10–90% range (ideal ≈ 0.8) */
  wideHitRate: number;
  /** Share inside the 25–75% range (ideal ≈ 0.5) */
  likelyHitRate: number;
  /** Share where the direction (up/down vs. start) matched the median */
  directionHitRate: number;
  samples: number;
}

/**
 * Replays the method over history: at each past day, fit on the previous `window`
 * returns, then check where the price actually was `n` periods later.
 */
export function backtest(candles: Candle[], horizon: Horizon, opts: { everyDay?: boolean; window?: number; step?: number } = {}): BacktestResult | null {
  const closes = candles.map((c) => c.close);
  const n = horizonPeriods(horizon, opts.everyDay);
  const window = opts.window ?? 60;
  const step = opts.step ?? 1;
  let wide = 0;
  let likely = 0;
  let dir = 0;
  let samples = 0;
  for (let t = window; t + n < closes.length; t += step) {
    const rets = logReturns(closes.slice(t - window, t + 1));
    if (rets.length < 20) continue;
    const { mean, std } = meanStd(rets);
    const b = band(closes[t], mean * DRIFT_SHRINK, std, n);
    const actual = closes[t + n];
    if (actual >= b.wideLow && actual <= b.wideHigh) wide++;
    if (actual >= b.likelyLow && actual <= b.likelyHigh) likely++;
    if (Math.sign(actual - closes[t]) === Math.sign(b.median - closes[t])) dir++;
    samples++;
  }
  if (samples < 10) return null;
  return { horizon, wideHitRate: wide / samples, likelyHitRate: likely / samples, directionHitRate: dir / samples, samples };
}
