import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketData, RANGES, bollinger, ema, formatChange, formatCompact, formatPercent, formatPrice, macd, normalizeSymbol, rsi, sma, symbolToPath } from '../src/index.ts';

test('symbols normalise from loose input', () => {
  assert.equal(normalizeSymbol('aapl'), 'AAPL');
  assert.equal(normalizeSymbol('btc'), 'BTC-USD');
  assert.equal(normalizeSymbol('eurusd'), 'EUR/USD');
  assert.equal(normalizeSymbol('EUR-USD'), 'EUR/USD');
  assert.equal(normalizeSymbol(symbolToPath('EUR/USD')), 'EUR/USD');
  assert.equal(normalizeSymbol('shop.to'), 'SHOP.TO');
});

test('sma and ema', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = ema([1, 2, 3, 4, 5], 3);
  assert.equal(e[2], 2);
  assert.equal(e[3], 3);
  assert.equal(e[4], 4);
});

test('rsi is 100 for a rising series and bounded otherwise', () => {
  const up = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(rsi(up, 14)[29], 100);
  const zig = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 5);
  for (const v of rsi(zig, 14).slice(14)) assert.ok(v !== null && v >= 0 && v <= 100);
});

test('macd and bollinger line up with input', () => {
  const v = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3));
  const m = macd(v);
  assert.equal(m.line.length, 80);
  assert.equal(m.line[24], null);
  assert.notEqual(m.line[25], null);
  assert.notEqual(m.signal[33], null);
  const b = bollinger(v);
  assert.ok((b.upper[40] as number) > (b.middle[40] as number));
  assert.ok((b.lower[40] as number) < (b.middle[40] as number));
});

test('formatting', () => {
  assert.equal(formatPrice(1234.5), '$1,234.50');
  assert.equal(formatPrice(1.08321, 'USD', { forex: true }), '1.0832');
  assert.equal(formatPrice(0.00123), '$0.001230');
  assert.equal(formatChange(-2.5), '−2.5000');
  assert.equal(formatPercent(1.234), '+1.23%');
  assert.equal(formatCompact(3.2e12), '3.20T');
  assert.equal(formatPrice(null), '—');
});

test('demo mode serves every asset class and every range', async () => {
  const md = new MarketData({ demoOnly: true });
  for (const s of ['AAPL', 'SPY', 'BTC-USD', 'EUR/USD', 'SHOP.TO']) {
    const q = await md.quote(s);
    assert.equal(q.source, 'Demo data');
    assert.ok(q.price > 0);
    for (const r of RANGES) {
      const h = await md.history(s, r);
      assert.ok(h.candles.length > 3, `${s} ${r} has bars`);
      const last = h.candles[h.candles.length - 1];
      assert.ok(Math.abs(last.close - q.price) / q.price < 1e-9, `${s} ${r} ends at the quote`);
      for (let i = 1; i < h.candles.length; i++) assert.ok(h.candles[i].time > h.candles[i - 1].time, 'times ascend');
      for (const c of h.candles) assert.ok(c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close));
    }
  }
});

test('overview splits gainers and losers', async () => {
  const md = new MarketData({ demoOnly: true });
  const o = await md.overview();
  assert.equal(o.indexes.length, 4);
  assert.ok(o.gainers.every((q) => q.changePercent > 0));
  assert.ok(o.losers.every((q) => q.changePercent < 0));
  assert.equal(o.crypto.length, 6);
  assert.equal(o.forex.length, 6);
});

test('search finds by symbol and name', async () => {
  const md = new MarketData({ demoOnly: true });
  assert.equal((await md.search('apple'))[0].symbol, 'AAPL');
  assert.ok((await md.search('eurusd')).some((r) => r.symbol === 'EUR/USD'));
  assert.ok((await md.search('bitcoin')).some((r) => r.symbol === 'BTC-USD'));
  assert.deepEqual(await md.news(), []);
});

test('a failing live source falls back to labelled demo data', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 500 })) as typeof fetch;
  try {
    const md = new MarketData({ finnhubKey: 'x', massiveKey: 'x' });
    const q = await md.quote('AAPL');
    assert.equal(q.source, 'Demo data');
    const h = await md.history('BTC-USD', '1M');
    assert.ok(h.candles.length > 5);
    const qs = await md.quotes(['ETH-USD', 'EUR/USD']);
    assert.equal(qs.length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('dotted US share classes stay on the US feed; foreign suffixes do not', async () => {
  const { instrumentFor } = await import('../src/index.ts');
  assert.equal(instrumentFor('BRK.B').country, 'US');
  assert.equal(instrumentFor('BF.B').country, 'US');
  assert.equal(instrumentFor('BP.L').country, 'United Kingdom');
  assert.equal(instrumentFor('SAP.DE').currency, 'EUR');
});
