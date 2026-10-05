import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHoldings, valueHoldings, type Transaction } from '../src/index.ts';

const tx: Transaction[] = [
  { symbol: 'AAPL', type: 'buy', quantity: 10, price: 100, fee: 1, tradedAt: '2026-01-02' },
  { symbol: 'AAPL', type: 'buy', quantity: 10, price: 120, tradedAt: '2026-02-02' },
  { symbol: 'AAPL', type: 'sell', quantity: 5, price: 150, fee: 1, tradedAt: '2026-03-02' },
  { symbol: 'AAPL', type: 'dividend', quantity: 1, price: 4, tradedAt: '2026-03-10' },
  { symbol: 'MSFT', type: 'buy', quantity: 2, price: 400, tradedAt: '2026-01-05' },
  { symbol: 'MSFT', type: 'sell', quantity: 2, price: 450, tradedAt: '2026-04-05' },
];

test('average-cost holdings, realised gains and dividends', () => {
  const h = computeHoldings(tx);
  const aapl = h.find((x) => x.symbol === 'AAPL')!;
  // cost 2201 for 20 shares → avg 110.05; sell 5 @150 minus fee 1 → gain 5*150-1-5*110.05 = 198.75
  assert.equal(aapl.quantity, 15);
  assert.ok(Math.abs(aapl.averageCost - 110.05) < 1e-9);
  assert.ok(Math.abs(aapl.realizedGain - 198.75) < 1e-9);
  assert.equal(aapl.dividends, 4);
  const msft = h.find((x) => x.symbol === 'MSFT')!;
  assert.equal(msft.quantity, 0);
  assert.equal(msft.realizedGain, 100);
});

test('valuation totals and weights', () => {
  const v = valueHoldings(computeHoldings(tx), new Map([['AAPL', { price: 130, change: 2 }]]));
  assert.equal(v.rows.length, 1);
  assert.equal(v.totalValue, 1950);
  assert.ok(Math.abs(v.totalGain - (1950 - 15 * 110.05)) < 1e-9);
  assert.equal(v.dayChange, 30);
  assert.equal(v.rows[0].weight, 100);
  assert.ok(Math.abs(v.realizedGain - 298.75) < 1e-9);
});

test('selling more than held is capped', () => {
  const h = computeHoldings([
    { symbol: 'X', type: 'buy', quantity: 1, price: 10, tradedAt: '2026-01-01' },
    { symbol: 'X', type: 'sell', quantity: 3, price: 12, tradedAt: '2026-01-02' },
  ]);
  assert.equal(h[0].quantity, 0);
  assert.equal(h[0].realizedGain, 2);
});
