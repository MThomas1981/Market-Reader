import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORIZONS, MarketData, analyze, backtest, forecast, normCdf, type Candle } from '../src/index.ts';

function walk(n: number, sigma: number, seed = 7, drift = 0): Candle[] {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Candle[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const z = Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
    const o = p;
    p = p * Math.exp(drift + sigma * z);
    out.push({ time: 1_700_000_000 + i * 86400, open: o, high: Math.max(o, p), low: Math.min(o, p), close: p, volume: 0 });
  }
  return out;
}

test('normal CDF', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normCdf(1.2815515655446004) - 0.9) < 1e-4);
  assert.ok(Math.abs(normCdf(-1.96) - 0.025) < 1e-3);
});

test('forecast bands widen with horizon and stay ordered', () => {
  const f = forecast(walk(300, 0.02), HORIZONS);
  assert.equal(f.points.length, 5);
  let prevWidth = 0;
  for (const p of f.points) {
    assert.ok(p.wideLow < p.likelyLow && p.likelyLow < p.median && p.median < p.likelyHigh && p.likelyHigh < p.wideHigh);
    const width = (p.wideHigh - p.wideLow) / f.lastPrice;
    assert.ok(width > prevWidth);
    prevWidth = width;
    assert.ok(p.probUp > 0 && p.probUp < 1);
  }
  assert.ok(Math.abs(f.dailyVolatility - 0.02) < 0.004, `vol ${f.dailyVolatility}`);
  assert.equal(f.points[4].periods, 126);
});

test('forecast needs enough history', () => {
  assert.throws(() => forecast(walk(10, 0.02)));
});

test('backtest is calibrated on a true random walk', () => {
  const b = backtest(walk(800, 0.015, 11), '1W');
  assert.ok(b);
  assert.ok(b!.wideHitRate > 0.7 && b!.wideHitRate < 0.9, `wide ${b!.wideHitRate}`);
  assert.ok(b!.likelyHitRate > 0.38 && b!.likelyHitRate < 0.62, `likely ${b!.likelyHitRate}`);
});

test('analytics: beta of an asset against itself is 1, drawdown is non-positive', () => {
  const c = walk(260, 0.02, 3);
  const a = analyze(c, c);
  assert.ok(Math.abs((a.beta ?? 0) - 1) < 1e-9);
  assert.ok(Math.abs((a.correlation ?? 0) - 1) < 1e-9);
  assert.ok(a.maxDrawdownPct <= 0);
  assert.ok(a.worstDayPct <= a.bestDayPct);
  assert.ok(Math.abs(a.relativeReturnPct ?? 1) < 1e-9);
  assert.ok(a.vsSma200Pct !== null);
});

test('forecast and analysis run on demo history for every asset class', async () => {
  const md = new MarketData({ demoOnly: true });
  for (const s of ['AAPL', 'BTC-USD', 'EUR/USD']) {
    const h = await md.history(s, '1Y');
    const f = forecast(h.candles, HORIZONS, { everyDay: s === 'BTC-USD' });
    assert.equal(f.points.length, 5);
    analyze(h.candles);
  }
});
