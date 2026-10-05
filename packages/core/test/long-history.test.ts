import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketData, toWeekly } from '../src/index.ts';

const DAY = 86_400;
const withFetch = async (handler: (url: string) => unknown, run: () => Promise<void>) => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    const body = handler(url);
    return body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
};

test('5Y (daily) and MAX (weekly) for US stocks come from Tiingo, adjusted, with share classes written BRK-B', async () => {
  const seen: string[] = [];
  await withFetch(
    (url) => {
      seen.push(url);
      if (url.includes('api.tiingo.com')) {
        return [
          { date: '1980-12-12T00:00:00.000Z', open: 28.75, high: 28.87, low: 28.75, close: 28.75, volume: 1, adjOpen: 0.1, adjHigh: 0.11, adjLow: 0.1, adjClose: 0.1, adjVolume: 100 },
          { date: '2026-09-28T00:00:00.000Z', open: 330, high: 335, low: 325, close: 330.32, volume: 5, adjOpen: 330, adjHigh: 335, adjLow: 325, adjClose: 330.32, adjVolume: 5 },
        ];
      }
      return new Response('{}', { status: 500 });
    },
    async () => {
      const md = new MarketData({ tiingoKey: 'k', massiveKey: 'm' });
      const h = await md.history('AAPL', 'MAX');
      assert.equal(h.source, 'Tiingo');
      assert.equal(h.candles[0].close, 0.1);
      assert.equal(h.candles.at(-1)!.close, 330.32);
      await md.history('BRK.B', '5Y');
      assert.ok(seen.some((u) => u.includes('/daily/brk-b/prices') && u.includes('resampleFreq=daily')));
      assert.ok(seen.some((u) => u.includes('/daily/aapl/prices') && u.includes('resampleFreq=weekly')));
    },
  );
});

test('without a Tiingo key, 5Y says it is limited to Massive’s 2 years', async () => {
  const now = Math.floor(Date.now() / 1000);
  await withFetch(
    (url) => (url.includes('api.massive.com')
      ? { results: [{ t: (now - 700 * DAY) * 1000, o: 1, h: 1, l: 1, c: 1, v: 1 }, { t: (now - 7 * DAY) * 1000, o: 2, h: 2, l: 2, c: 2, v: 1 }] }
      : new Response('{}', { status: 500 })),
    async () => {
      const h = await new MarketData({ massiveKey: 'm' }).history('MSFT', '5Y');
      assert.equal(h.source, 'Massive');
      assert.match(h.note ?? '', /about 2 years.*Tiingo/);
    },
  );
});

test('crypto 5Y and MAX come from Kraken weekly bars; unknown pairs fall back to CoinGecko', async () => {
  const now = Math.floor(Date.now() / 1000);
  await withFetch(
    (url) => {
      if (url.includes('pair=XBTUSD')) {
        return { error: [], result: { XXBTZUSD: [[1380758400, '122', '124', '122', '123.8', '123', '7', 9], [now - 7 * DAY, '84000', '85000', '83000', '84606.1', '84000', '2900', 100]], last: now } };
      }
      if (url.includes('api.kraken.com')) return { error: ['EQuery:Unknown asset pair'] };
      if (url.includes('coingecko')) return { prices: [[(now - 300 * DAY) * 1000, 1], [(now - DAY) * 1000, 2]], total_volumes: [] };
      return new Response('{}', { status: 500 });
    },
    async () => {
      const md = new MarketData({});
      const max = await md.history('BTC-USD', 'MAX');
      assert.equal(max.source, 'Kraken');
      assert.equal(new Date(max.candles[0].time * 1000).getUTCFullYear(), 2013);
      const five = await md.history('BTC-USD', '5Y');
      assert.equal(five.candles.length, 1); // 2013 bar is outside 5 years
      const bnb = await md.history('BNB-USD', 'MAX');
      assert.equal(bnb.source, 'CoinGecko');
      assert.match(bnb.note ?? '', /1 year/);
    },
  );
});

test('daily bars combine into Monday-start weeks', () => {
  const mon = Date.UTC(2026, 8, 28) / 1000; // Monday 28 Sep 2026
  const bars = [0, 1, 2, 7].map((d, i) => ({ time: mon + d * DAY, open: i + 1, high: i + 2, low: i, close: i + 1.5, volume: 1 }));
  const w = toWeekly(bars);
  assert.equal(w.length, 2);
  assert.deepEqual([w[0].open, w[0].high, w[0].low, w[0].close, w[0].volume], [1, 4, 0, 3.5, 3]);
});
