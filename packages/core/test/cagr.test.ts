import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cagrPct, cagrRating, forecast, gradeFor, longRunWeight, type Candle } from '../src/index.ts';

const WEEK = 7 * 86_400;
/** Weekly closes growing at `annual` % a year, with a small wobble. */
function weekly(years: number, annual: number, start = 100, wobble = 0.02): Candle[] {
  const n = Math.round(years * 52.18);
  const end = Math.floor(Date.UTC(2026, 9, 2) / 1000);
  const g = Math.pow(1 + annual / 100, 1 / 52.18);
  return Array.from({ length: n + 1 }, (_, i) => {
    const close = start * Math.pow(g, i) * (1 + wobble * Math.sin(i / 3));
    return { time: end - (n - i) * WEEK, open: close, high: close, low: close, close, volume: 0 };
  });
}

test('CAGR formula: doubling in 5 years is about 14.87% a year', () => {
  assert.ok(Math.abs(cagrPct(100, 200, 5) - 14.87) < 0.01);
  assert.ok(Math.abs(cagrPct(100, 50, 2) - -29.29) < 0.01);
  assert.ok(Number.isNaN(cagrPct(0, 10, 1)));
});

test('grades follow the A–F scale', () => {
  assert.deepEqual([22, 15, 12, 10, 7, 5, 2, 0, -3].map(gradeFor), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F']);
});

test('rating uses 5 years when available and compares with the S&P 500', () => {
  const r = cagrRating(weekly(12, 18), { symbol: 'SPY', candles: weekly(12, 11) });
  assert.equal(r.basisYears, 5);
  assert.equal(r.grade, 'A');
  assert.ok(Math.abs(r.cagrPct! - 18) < 1.5, `cagr ${r.cagrPct}`);
  assert.ok(r.periods.find((p) => p.years === 10)!.cagrPct !== null);
  assert.ok(r.benchmark && r.benchmark.differencePts > 5);
  assert.ok(r.consistency !== null && r.consistency > 0.9);
  assert.match(r.summary, /^A: \+1\d\.\d% a year over 5 years/);
});

test('short history falls back to 3 or 1 years and says so', () => {
  const r = cagrRating(weekly(2, 6));
  assert.equal(r.basisYears, 1);
  assert.equal(r.periods.find((p) => p.years === 3)!.cagrPct, null);
  assert.match(r.summary, /Based on 1 year only/);
  const none = cagrRating(weekly(0.5, 6));
  assert.equal(none.grade, null);
});

test('the projection trend leans on the long-run CAGR', () => {
  const daily: Candle[] = Array.from({ length: 260 }, (_, i) => {
    const close = 100 * (1 + 0.03 * Math.sin(i / 5)); // flat past year
    return { time: 1_700_000_000 + i * 86_400, open: close, high: close, low: close, close, volume: 0 };
  });
  const flat = forecast(daily);
  const anchored = forecast(daily, undefined, { longRun: { cagrPct: 20, basisYears: 5 } });
  assert.equal(anchored.trend.longRunWeight, 0.6);
  assert.equal(longRunWeight(3), 0.45);
  assert.equal(flat.trend.longRunWeight, 0);
  const m6 = (f: typeof flat) => f.points.find((p) => p.horizon === '6M')!.median;
  assert.ok(m6(anchored) > m6(flat), 'a strong long-run CAGR lifts the 6-month middle estimate');
  // (40% of the past year's log growth + 60% of ln(1.20)) / 2, per year
  const t = anchored.trend;
  const expected = (Math.exp(0.5 * (0.4 * Math.log(1 + t.pastYearAnnualPct / 100) + 0.6 * Math.log(1.2))) - 1) * 100;
  assert.ok(Math.abs(t.projectedAnnualPct - expected) < 0.05, `${t.projectedAnnualPct} vs ${expected}`);
});
