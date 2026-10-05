import type { Candle } from './types';
import { logReturns } from './forecast';
import { rsi, sma } from './indicators';

export interface RiskReturn {
  periodStart: string;
  periodEnd: string;
  totalReturnPct: number;
  annualizedReturnPct: number;
  annualVolatilityPct: number;
  /** Return per unit of risk, risk-free rate taken as 0 */
  sharpe: number | null;
  sortino: number | null;
  maxDrawdownPct: number;
  maxDrawdownFrom: string | null;
  maxDrawdownTo: string | null;
  currentDrawdownPct: number;
  bestDayPct: number;
  bestDayDate: string;
  worstDayPct: number;
  worstDayDate: string;
  upDaysPct: number;
  /** Against the benchmark (S&P 500 via SPY), when supplied */
  beta: number | null;
  correlation: number | null;
  benchmarkReturnPct: number | null;
  relativeReturnPct: number | null;
  /** Technical snapshot */
  rsi14: number | null;
  vsSma50Pct: number | null;
  vsSma200Pct: number | null;
  fromHighPct: number;
  fromLowPct: number;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

/** Risk and return statistics from daily candles (oldest first). */
export function analyze(candles: Candle[], benchmark?: Candle[], opts: { everyDay?: boolean } = {}): RiskReturn {
  if (candles.length < 30) throw new Error('Need at least 30 days of prices for this analysis.');
  const closes = candles.map((c) => c.close);
  const perYear = opts.everyDay ? 365 : 252;
  const first = closes[0];
  const last = closes[closes.length - 1];
  const years = Math.max((candles[candles.length - 1].time - candles[0].time) / (365.25 * 86400), 1 / 365);

  const simple = closes.slice(1).map((c, i) => c / closes[i] - 1);
  const lr = logReturns(closes);
  const meanLr = lr.reduce((a, b) => a + b, 0) / lr.length;
  const sd = Math.sqrt(lr.reduce((a, b) => a + (b - meanLr) ** 2, 0) / Math.max(1, lr.length - 1));
  const downside = Math.sqrt(lr.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / lr.length);

  let peak = closes[0];
  let peakIdx = 0;
  let maxDd = 0;
  let ddFrom: number | null = null;
  let ddTo: number | null = null;
  closes.forEach((c, i) => {
    if (c > peak) {
      peak = c;
      peakIdx = i;
    }
    const dd = c / peak - 1;
    if (dd < maxDd) {
      maxDd = dd;
      ddFrom = peakIdx;
      ddTo = i;
    }
  });

  let best = 0;
  let worst = 0;
  simple.forEach((r, i) => {
    if (r > simple[best]) best = i;
    if (r < simple[worst]) worst = i;
  });

  let beta: number | null = null;
  let correlation: number | null = null;
  let benchmarkReturnPct: number | null = null;
  if (benchmark && benchmark.length > 30) {
    const bMap = new Map(benchmark.map((b) => [day(b.time), b.close]));
    const pairs: [number, number][] = [];
    for (let i = 1; i < candles.length; i++) {
      const a0 = bMap.get(day(candles[i - 1].time));
      const a1 = bMap.get(day(candles[i].time));
      if (a0 && a1) pairs.push([closes[i] / closes[i - 1] - 1, a1 / a0 - 1]);
    }
    if (pairs.length > 20) {
      const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length;
      const my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
      let cov = 0;
      let vx = 0;
      let vy = 0;
      for (const [x, y] of pairs) {
        cov += (x - mx) * (y - my);
        vx += (x - mx) ** 2;
        vy += (y - my) ** 2;
      }
      beta = vy > 0 ? cov / vy : null;
      correlation = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null;
    }
    const bStart = bMap.get(day(candles[0].time)) ?? benchmark[0].close;
    const bEnd = benchmark[benchmark.length - 1].close;
    benchmarkReturnPct = (bEnd / bStart - 1) * 100;
  }

  const r = rsi(closes).at(-1) ?? null;
  const s50 = sma(closes, 50).at(-1) ?? null;
  const s200 = sma(closes, 200).at(-1) ?? null;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const totalReturnPct = (last / first - 1) * 100;

  return {
    periodStart: day(candles[0].time),
    periodEnd: day(candles[candles.length - 1].time),
    totalReturnPct,
    annualizedReturnPct: (Math.pow(last / first, 1 / years) - 1) * 100,
    annualVolatilityPct: sd * Math.sqrt(perYear) * 100,
    sharpe: sd > 0 ? (meanLr * perYear) / (sd * Math.sqrt(perYear)) : null,
    sortino: downside > 0 ? (meanLr * perYear) / (downside * Math.sqrt(perYear)) : null,
    maxDrawdownPct: maxDd * 100,
    maxDrawdownFrom: ddFrom !== null ? day(candles[ddFrom].time) : null,
    maxDrawdownTo: ddTo !== null ? day(candles[ddTo].time) : null,
    currentDrawdownPct: (last / Math.max(...closes) - 1) * 100,
    bestDayPct: simple[best] * 100,
    bestDayDate: day(candles[best + 1].time),
    worstDayPct: simple[worst] * 100,
    worstDayDate: day(candles[worst + 1].time),
    upDaysPct: (simple.filter((x) => x > 0).length / simple.length) * 100,
    beta,
    correlation,
    benchmarkReturnPct,
    relativeReturnPct: benchmarkReturnPct !== null ? totalReturnPct - benchmarkReturnPct : null,
    rsi14: r,
    vsSma50Pct: s50 ? (last / s50 - 1) * 100 : null,
    vsSma200Pct: s200 ? (last / s200 - 1) * 100 : null,
    fromHighPct: (last / hi - 1) * 100,
    fromLowPct: (last / lo - 1) * 100,
  };
}
