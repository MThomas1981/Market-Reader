import 'server-only';
import { MarketData } from '@market-reader/core';

const g = globalThis as unknown as { __marketData?: MarketData; __marketDataClass?: typeof MarketData };

// Rebuild when the data-layer code changes (hot reload in development), otherwise reuse it.
if (g.__marketDataClass !== MarketData) {
  g.__marketData = undefined;
  g.__marketDataClass = MarketData;
}

/** One shared data layer per server process, so its cache is shared across requests. */
export const market: MarketData =
  g.__marketData ??
  (g.__marketData = new MarketData({
    finnhubKey: process.env.FINNHUB_API_KEY || undefined,
    massiveKey: process.env.MASSIVE_API_KEY || undefined,
    massiveBaseUrl: process.env.MASSIVE_BASE_URL || undefined,
    coingeckoKey: process.env.COINGECKO_API_KEY || undefined,
    tiingoKey: process.env.TIINGO_API_KEY || undefined,
    demoOnly: process.env.MARKET_READER_DEMO === 'true',
  }));
