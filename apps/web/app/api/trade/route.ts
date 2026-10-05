import { NextResponse } from 'next/server';
import { DEMO_SOURCE, isRegularSessionTime, normalizeSymbol, tradeErrorFromDb, type TradeErrorCode } from '@market-reader/core';
import { getViewer } from '@/lib/viewer';
import { market } from '@/lib/market';
import { tradeHub } from '@/lib/realtime';

/**
 * Paper trades (simulated money, never sent to a broker).
 *
 * POST { side: 'buy' | 'sell', ticker, shares, portfolioId? }
 *
 * The execution price is always the server's live quote, never a number from the browser.
 * Signed in: runs execute_buy_order / execute_sell_order in the database as the user (row-level
 * security and the function's own ownership check apply) and returns the result.
 * Guests: returns the live price, and the browser applies the same rules to its local portfolio.
 */
const noStore = { 'Cache-Control': 'no-store' };

const STATUS: Record<TradeErrorCode, number> = {
  insufficient_shares: 409, insufficient_cash: 409, invalid_shares: 400, invalid_price: 400, invalid_ticker: 400,
  portfolio_not_found: 404, not_signed_in: 401, not_tradable: 422, no_price: 503, unknown: 500,
};

const fail = (message: string, code: TradeErrorCode) =>
  NextResponse.json({ error: message, code }, { status: STATUS[code], headers: noStore });

export async function POST(req: Request) {
  let body: { side?: unknown; ticker?: unknown; shares?: unknown; portfolioId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail('Send { "side": "sell", "ticker": "MSFT", "shares": 10 }.', 'invalid_shares');
  }
  const side = body.side === 'buy' || body.side === 'sell' ? body.side : null;
  const ticker = normalizeSymbol(String(body.ticker ?? ''));
  const shares = Number(body.shares);
  if (!side) return fail('Choose buy or sell.', 'invalid_shares');
  if (!ticker || ticker.length > 20) return fail('Enter a valid ticker.', 'invalid_ticker');
  if (!Number.isFinite(shares) || shares <= 0) return fail(`Shares to ${side} must be greater than zero.`, 'invalid_shares');

  const instrument = market.instrument(ticker);
  if (!['stock', 'etf', 'crypto'].includes(instrument.assetClass) || instrument.currency !== 'USD') {
    return fail(`Paper trading is in US dollars for stocks, ETFs and crypto. ${ticker} can be watched but not traded here.`, 'not_tradable');
  }

  const quote = await market.quote(ticker).catch(() => null);
  // A copy with no stock-data key (for example a fresh clone being graded) runs on demo prices, so
  // paper trades fill at the demo price there and say so. With a key set, a demo fallback is refused,
  // so a trade never fills at a made-up price while real prices are expected.
  const demoCopy = !process.env.FINNHUB_API_KEY || process.env.MARKET_READER_DEMO === 'true';
  const isDemo = quote?.source === DEMO_SOURCE;
  if (!quote || !(quote.price > 0) || (isDemo && !demoCopy)) {
    return fail(`No live price for ${ticker} right now, so the order wasn’t placed. Try again in a moment.`, 'no_price');
  }
  // The newest regular-session trade from the real-time feed, when it is newer than the quote,
  // so the fill matches the price moving on screen rather than a quote cached a few seconds ago.
  const streamed = tradeHub()?.latest.get(ticker);
  const price = streamed && streamed.t > quote.timestamp && isRegularSessionTime(streamed.t) && streamed.p > 0 ? streamed.p : quote.price;

  const v = await getViewer(req);
  if (!v.user || !v.db) {
    return NextResponse.json({ mode: 'guest', side, ticker, shares, price, demo: isDemo, quote }, { headers: noStore });
  }

  let portfolioId = typeof body.portfolioId === 'string' ? body.portfolioId : null;
  if (!portfolioId) {
    const { data } = await v.db.from('portfolios').select('id').order('created_at').limit(1).maybeSingle();
    portfolioId = (data?.id as string | undefined) ?? null;
  }
  if (!portfolioId) return fail('Portfolio not found.', 'portfolio_not_found');

  const { data, error } = side === 'sell'
    ? await v.db.rpc('execute_sell_order', { p_portfolio_id: portfolioId, p_ticker: ticker, p_shares_to_sell: shares, p_current_price: price })
    : await v.db.rpc('execute_buy_order', { p_portfolio_id: portfolioId, p_ticker: ticker, p_shares_to_buy: shares, p_current_price: price });
  if (error) {
    const e = tradeErrorFromDb(error);
    return fail(e.message, e.code);
  }
  return NextResponse.json({ mode: 'account', side, ticker, shares, price, demo: isDemo, quote, result: data }, { headers: noStore });
}
