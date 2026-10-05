/**
 * CAGR rating: compound annual growth rate over 1, 3, 5 and 10 years, graded A to F,
 * and used as the long-run anchor in every price projection (see forecast.ts).
 *
 *   CAGR = (end price / start price) ^ (1 / years) − 1
 *
 * Grade, from the longest well-covered period (5 years preferred, then 3, then 1):
 *   A  15% a year or more     strong long-run growth
 *   B  10% to 15%             about the stock market's long-run pace or better
 *   C   5% to 10%             moderate growth
 *   D   0% to 5%              little growth
 *   F  below 0%               shrinking value
 * Prices are adjusted for splits (and for dividends when Tiingo supplies the history), so this is
 * price growth; dividends paid in cash are not added back unless the source adjusts for them.
 */
import type { Candle } from './types';

export type CagrGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface CagrPeriod {
  years: number;
  /** Percent a year; null when the history doesn't reach back far enough */
  cagrPct: number | null;
  startDate: string | null;
  startPrice: number | null;
}

export interface CagrRating {
  periods: CagrPeriod[];
  /** The period the grade is based on */
  basisYears: number | null;
  cagrPct: number | null;
  grade: CagrGrade | null;
  label: string;
  /** Share of rolling 1-year windows that ended higher (how steady the growth has been), 0–1 */
  consistency: number | null;
  benchmark: { symbol: string; cagrPct: number; differencePts: number } | null;
  endPrice: number;
  endDate: string;
  /** One-line, plain-language reading of the rating */
  summary: string;
}

export const CAGR_PERIODS = [1, 3, 5, 10] as const;

export const CAGR_SCALE: { grade: CagrGrade; min: number; label: string }[] = [
  { grade: 'A', min: 15, label: 'Strong long-run growth' },
  { grade: 'B', min: 10, label: 'Solid growth, near the market’s long-run pace' },
  { grade: 'C', min: 5, label: 'Moderate growth' },
  { grade: 'D', min: 0, label: 'Little growth' },
  { grade: 'F', min: -Infinity, label: 'Shrinking value' },
];

const YEAR = 365.25 * 86_400;
const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

export function cagrPct(startPrice: number, endPrice: number, years: number): number {
  if (!(startPrice > 0) || !(endPrice > 0) || !(years > 0)) return NaN;
  return (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100;
}

export function gradeFor(pct: number): CagrGrade {
  return CAGR_SCALE.find((s) => pct >= s.min)!.grade;
}

/** Close nearest to `years` before the last bar; null if the history starts too late. */
function startPoint(candles: Candle[], years: number): Candle | null {
  const last = candles[candles.length - 1];
  const target = last.time - years * YEAR;
  if (candles[0].time > target + 21 * 86_400) return null; // allow 3 weeks of slack for weekly bars and holidays
  let best = candles[0];
  for (const c of candles) {
    if (Math.abs(c.time - target) < Math.abs(best.time - target)) best = c;
    if (c.time > target) break;
  }
  return best;
}

export function cagrPeriods(candles: Candle[]): CagrPeriod[] {
  if (candles.length < 2) return CAGR_PERIODS.map((years) => ({ years, cagrPct: null, startDate: null, startPrice: null }));
  const end = candles[candles.length - 1];
  return CAGR_PERIODS.map((years) => {
    const s = startPoint(candles, years);
    if (!s) return { years, cagrPct: null, startDate: null, startPrice: null };
    const exact = (end.time - s.time) / YEAR;
    return { years, cagrPct: cagrPct(s.close, end.close, exact), startDate: iso(s.time), startPrice: s.close };
  });
}

/** Share of rolling one-year windows with a gain. */
function consistency(candles: Candle[]): number | null {
  if (candles.length < 2 || candles[candles.length - 1].time - candles[0].time < 1.5 * YEAR) return null;
  let up = 0;
  let n = 0;
  let j = 0;
  for (let i = 0; i < candles.length; i++) {
    const target = candles[i].time + YEAR;
    while (j < candles.length && candles[j].time < target) j++;
    if (j >= candles.length) break;
    n++;
    if (candles[j].close > candles[i].close) up++;
  }
  return n >= 20 ? up / n : null;
}

/**
 * CAGR rating from long price history (oldest first; weekly or daily bars).
 * `benchmark` (e.g. the S&P 500 via SPY) is compared over the same basis period.
 */
export function cagrRating(
  candles: Candle[],
  benchmark?: { symbol: string; candles: Candle[] } | null,
  opts: { currencyPair?: boolean } = {},
): CagrRating {
  const periods = cagrPeriods(candles);
  const basis = [5, 3, 1].map((y) => periods.find((p) => p.years === y)!).find((p) => p.cagrPct !== null && Number.isFinite(p.cagrPct)) ?? null;
  const end = candles[candles.length - 1];
  const grade = basis ? gradeFor(basis.cagrPct!) : null;
  const label = grade ? CAGR_SCALE.find((s) => s.grade === grade)!.label : 'Not enough history to rate';
  let bench: CagrRating['benchmark'] = null;
  if (basis && benchmark && benchmark.candles.length > 1) {
    const bp = cagrPeriods(benchmark.candles).find((p) => p.years === basis.years);
    if (bp?.cagrPct !== null && bp?.cagrPct !== undefined && Number.isFinite(bp.cagrPct)) {
      bench = { symbol: benchmark.symbol, cagrPct: bp.cagrPct, differencePts: basis.cagrPct! - bp.cagrPct };
    }
  }
  const cons = consistency(candles);
  const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
  const summary = !basis
    ? 'Less than a year of price history, so there is no long-run growth rate to anchor the projection.'
    : [
        `${grade}: ${pct(basis.cagrPct!)} a year over ${basis.years} year${basis.years > 1 ? 's' : ''} (${label.toLowerCase()})`,
        bench ? `, ${Math.abs(bench.differencePts).toFixed(1)} points ${bench.differencePts >= 0 ? 'ahead of' : 'behind'} the S&P 500 (${pct(bench.cagrPct)} a year)` : '',
        cons !== null ? `; higher after ${Math.round(cons * 100)}% of past one-year periods` : '',
        basis.years < 5 ? `. Based on ${basis.years} year${basis.years > 1 ? 's' : ''} only, so treat it as a weaker signal` : '',
        '.',
        opts.currencyPair ? ' For a currency pair this is the exchange rate’s drift, not an investment’s growth, so the grade is descriptive only.' : '',
      ].join('');
  return {
    periods, basisYears: basis?.years ?? null, cagrPct: basis?.cagrPct ?? null, grade, label,
    consistency: cons, benchmark: bench, endPrice: end?.close ?? NaN, endDate: end ? iso(end.time) : '', summary,
  };
}

/**
 * How much the projection leans on the long-run growth rate rather than the past year's trend:
 * more years of evidence, more weight.
 */
export function longRunWeight(basisYears: number | null): number {
  if (basisYears === null) return 0;
  return basisYears >= 5 ? 0.6 : basisYears >= 3 ? 0.45 : 0.25;
}
