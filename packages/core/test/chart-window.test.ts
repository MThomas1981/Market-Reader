import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MarketData, RANGE_RESOLUTION, chartWindow, ema, firstVisibleIndex, lookbackBucket, lookbackFor, lookbackSpan,
  movingAverage, resolutionFor, sanitizeLines, sma, visibleIndex, DEFAULT_MA_LINES, RESOLUTIONS,
} from '../src/index.ts';

test('each display range maps to the expected bar size', () => {
  const got = Object.fromEntries(Object.entries(RANGE_RESOLUTION).map(([r, res]) => [r, `${res.multiplier}${res.timespan}`]));
  assert.deepEqual(got, { '1D': '5minute', '5D': '15minute', '1M': '1hour', '6M': '1day', YTD: '1day', '1Y': '1day', '5Y': '1day', MAX: '1week' });
  assert.equal(resolutionFor('1D', 'forex').timespan, 'day'); // currencies only have daily rates
  assert.equal(resolutionFor('5Y', 'crypto').timespan, 'week'); // free crypto history beyond 2 years is weekly
});

test('lookback is rounded up to shared buckets and capped', () => {
  assert.deepEqual([0, 1, 20, 21, 199, 200, 201, 9999].map(lookbackBucket), [0, 20, 20, 50, 200, 200, 300, 500]);
});

test('lookback span always holds enough trading bars', () => {
  // 200 daily stock bars need ~280 calendar days; 200 5-minute bars need ~3 sessions.
  const d = lookbackSpan(200, RESOLUTIONS.d1, 'us-equity') / 86_400_000;
  assert.ok(d >= 280 && d < 320, `daily span ${d}`);
  const m = lookbackSpan(200, RESOLUTIONS.m5, 'us-equity') / 86_400_000;
  assert.ok(m >= 3, `5-minute span ${m}`);
  assert.equal(lookbackSpan(100, RESOLUTIONS.h1, 'always'), Math.ceil(100 * 3600 * 1000 * 1.02) + 86_400_000);
  const w = chartWindow('1Y', 'stock', 200, Date.UTC(2026, 9, 2));
  assert.equal(w.lookbackBars, 200);
  assert.ok(w.from < w.visibleStart! - 280 * 86_400_000);
});

test('1D and 5D keep whole New York sessions, including the buffer before them', () => {
  const day = (iso: string, mins: number[]) => mins.map((m) => ({ time: Date.parse(iso) / 1000 + m * 60, open: 1, high: 1, low: 1, close: 1, volume: 0 }));
  const candles = [...day('2026-09-29T13:30:00Z', [0, 5]), ...day('2026-09-30T13:30:00Z', [0, 5]), ...day('2026-10-01T13:30:00Z', [0, 5, 10])];
  const now = Date.parse('2026-10-01T21:00:00Z');
  assert.equal(firstVisibleIndex(candles, chartWindow('1D', 'stock', 200, now)), 4);
  assert.equal(firstVisibleIndex(candles, chartWindow('5D', 'stock', 0, now)), 0);
  assert.equal(visibleIndex(candles, candles[4].time), 4);
});

test('SMA is a rolling mean; EMA seeds with the SMA then smooths by 2/(n+1)', () => {
  const closes = [10, 11, 12, 13, 14, 15];
  assert.deepEqual(sma(closes, 3), [null, null, 11, 12, 13, 14]);
  const e = ema(closes, 3);
  assert.equal(e[2], 11); // seed = SMA of first 3
  assert.equal(e[3], 13 * 0.5 + 11 * 0.5); // k = 2 / (3 + 1)
  assert.deepEqual(movingAverage('SMA', closes, 3), sma(closes, 3));
  assert.deepEqual(movingAverage('EMA', closes, 3), e);
});

test('lookback needed by the active lines', () => {
  const lines = DEFAULT_MA_LINES.map((l) => ({ ...l, on: l.id === 'sma50' || l.id === 'ema50' }));
  assert.equal(lookbackFor(lines), 100); // EMA 50 wants 2x its period to settle
  assert.equal(lookbackFor([], { macd: true }), 35);
  assert.equal(sanitizeLines([{ type: 'SMA', period: 9999, on: true }])[0].period, 500);
  assert.equal(sanitizeLines('junk'), DEFAULT_MA_LINES);
});

test('a lookback buffer adds earlier bars without changing the visible ones, so a 200-bar average starts on bar one', async () => {
  const md = new MarketData({ demoOnly: true });
  for (const range of ['1D', '5D', '1M', '1Y', '5Y'] as const) {
    const plain = await md.history('AAPL', range);
    const buffered = await md.history('AAPL', range, 200);
    const vi = visibleIndex(buffered.candles, buffered.visibleFrom);
    assert.ok(vi >= 200, `${range}: only ${vi} buffer bars`);
    const visible = buffered.candles.slice(vi);
    assert.equal(visible.length, plain.candles.length, `${range} visible length`);
    assert.deepEqual(visible.map((c) => c.close), plain.candles.map((c) => c.close), `${range} visible prices`);
    const ma = sma(buffered.candles.map((c) => c.close), 200);
    assert.notEqual(ma[vi], null, `${range}: SMA 200 has a value at the first visible bar`);
  }
});

test('when a source is rate-limited, the last real chart is shown instead of made-up prices', async () => {
  const { TTLCache } = await import('../src/index.ts');
  const now = Math.floor(Date.now() / 1000);
  let limited = false;
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    if (!String(input).includes('api.massive.com')) return new Response('{}', { status: 500 });
    if (limited) return new Response('{}', { status: 429 });
    const results = Array.from({ length: 400 }, (_, i) => ({ t: (now - (400 - i) * 86_400) * 1000, o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i, v: 1 }));
    return new Response(JSON.stringify({ results }), { status: 200 });
  }) as typeof fetch;
  try {
    const md = new MarketData({ massiveKey: 'm' });
    const first = await md.history('MSFT', '6M', 50);
    assert.equal(first.source, 'Massive');
    limited = true;
    (md as unknown as { cache: unknown }).cache = new TTLCache(); // force a new provider call
    const second = await md.history('MSFT', '6M', 50);
    assert.equal(second.source, 'Massive');
    assert.match(second.note ?? '', /busy \(free plan limit\)/);
    assert.equal(second.candles.at(-1)!.close, first.candles.at(-1)!.close);
  } finally {
    globalThis.fetch = real;
  }
});
