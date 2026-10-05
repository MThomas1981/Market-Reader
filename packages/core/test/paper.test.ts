import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBuy, applySell, emptyPaperPortfolio, paperFromLedger, roundCents, TradeError, valuePaperPortfolio,
} from '../src/index.ts';

// Same scenario as supabase/tests/paper_trading_test.sql, so the browser and the database agree.
test('buys average in, sells realize P&L and credit cash', () => {
  let p = emptyPaperPortfolio();
  p = applyBuy(p, 'msft', 100, 400).portfolio;
  p = applyBuy(p, 'MSFT', 50, 430).portfolio;
  assert.equal(p.holdings[0].shares, 150);
  assert.equal(p.holdings[0].avgBuyPrice, 410);
  assert.equal(p.cashBalance, 38_500);

  const sold = applySell(p, 'MSFT', 60, 450);
  assert.equal(sold.trade.realizedPnl, 2400);
  assert.equal(sold.portfolio.holdings[0].shares, 90);
  assert.equal(sold.portfolio.holdings[0].avgBuyPrice, 410);
  assert.equal(sold.portfolio.cashBalance, 65_500);
  assert.equal(p.holdings[0].shares, 150, 'input is not mutated');

  const all = applySell(sold.portfolio, 'MSFT', 90, 380);
  assert.equal(all.trade.realizedPnl, -2700);
  assert.equal(all.portfolio.holdings.length, 0, 'fully sold holding is removed');
  assert.equal(all.portfolio.cashBalance, 99_700);
  assert.deepEqual(all.portfolio.transactions.map((t) => t.type), ['SELL', 'SELL', 'BUY', 'BUY']);
});

test('overselling and overspending are refused', () => {
  const p = applyBuy(emptyPaperPortfolio(), 'AAPL', 10, 200).portfolio;
  assert.throws(() => applySell(p, 'AAPL', 11, 210), (e: unknown) => e instanceof TradeError && e.code === 'insufficient_shares' && e.message === 'Insufficient shares to sell');
  assert.throws(() => applySell(p, 'TSLA', 1, 210), /Insufficient shares to sell/);
  assert.throws(() => applyBuy(p, 'NVDA', 1000, 200), (e: unknown) => e instanceof TradeError && e.code === 'insufficient_cash');
  assert.throws(() => applySell(p, 'AAPL', 0, 210), (e: unknown) => e instanceof TradeError && e.code === 'invalid_shares');
  assert.throws(() => applySell(p, 'AAPL', 1, 0), (e: unknown) => e instanceof TradeError && e.code === 'invalid_price');
});

test('fractional shares sell down to exactly zero', () => {
  let p = applyBuy(emptyPaperPortfolio(), 'BTC-USD', 0.3, 60_000).portfolio;
  p = applySell(p, 'BTC-USD', 0.1, 61_000).portfolio;
  p = applySell(p, 'BTC-USD', 0.2, 62_000).portfolio;
  assert.equal(p.holdings.length, 0);
  assert.equal(p.cashBalance, 100_000 - 18_000 + 6_100 + 12_400);
});

test('cents round half away from zero, like Postgres', () => {
  assert.equal(roundCents(1.005), 1.01);
  assert.equal(roundCents(-1.005), -1.01);
  assert.equal(roundCents(0.125), 0.13);
  assert.equal(roundCents(2.675), 2.68);
});

test('valuation: cash plus holdings at live prices', () => {
  let p = applyBuy(emptyPaperPortfolio(), 'AAPL', 10, 200).portfolio;
  p = applySell(p, 'AAPL', 4, 250).portfolio;
  const v = valuePaperPortfolio(p, new Map([['AAPL', { price: 260, change: 5 }]]));
  assert.equal(v.cash, 99_000);
  assert.equal(v.holdingsValue, 1560);
  assert.equal(v.totalValue, 100_560);
  assert.equal(v.unrealizedPnl, 360);
  assert.equal(v.realizedPnl, 200);
  assert.equal(v.totalReturn, 560);
  assert.equal(v.dayChange, 30);
});

test('old hand-entered ledger carries over at average cost', () => {
  const p = paperFromLedger([{ symbol: 'MSFT', type: 'buy', quantity: 100, price: 517.53, tradedAt: '2026-09-30' }]);
  assert.equal(p.holdings[0].ticker, 'MSFT');
  assert.equal(p.holdings[0].shares, 100);
  assert.equal(p.cashBalance, 100_000);
  assert.equal(p.startingCash, 151_753);
  assert.equal(p.transactions[0].type, 'BUY');
});
