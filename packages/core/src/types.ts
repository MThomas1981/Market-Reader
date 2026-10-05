export type AssetClass = 'stock' | 'etf' | 'crypto' | 'forex' | 'index';

export interface Instrument {
  /** Market Reader symbol, e.g. AAPL, SPY, BTC-USD, EUR/USD, SHOP.TO */
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange: string;
  currency: string;
  country: string;
  /** Provider-specific ids, e.g. { coingecko: 'bitcoin' } */
  providerIds?: Record<string, string>;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  /** Unix ms of the last price */
  timestamp: number;
  currency: string;
  /** Where the number came from, shown next to every price */
  source: string;
  delayed: boolean;
}

export interface Candle {
  /** Unix seconds (bar start) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Range = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';
export const RANGES: Range[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

export interface History {
  symbol: string;
  range: Range;
  candles: Candle[];
  source: string;
  /** Shown under the chart: how the prices are adjusted, or why a range is shorter than asked */
  note?: string;
  /** First visible bar (Unix seconds); earlier candles are lookback buffer for indicators */
  visibleFrom?: number;
  /** Bar size, e.g. "5-minute bars" */
  resolution?: string;
}

export interface KeyStats {
  marketCap: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  avgVolume: number | null;
  beta: number | null;
}

export interface Profile {
  symbol: string;
  name: string;
  exchange: string;
  industry: string | null;
  website: string | null;
  logo: string | null;
  description: string | null;
  stats: KeyStats;
  source: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: number;
  symbols: string[];
}

export interface EarningsResult {
  period: string;
  actual: number | null;
  estimate: number | null;
  surprisePercent: number | null;
}

export interface SearchResult {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange: string;
}

export interface MarketOverview {
  indexes: Quote[];
  gainers: Quote[];
  losers: Quote[];
  crypto: Quote[];
  forex: Quote[];
  updatedAt: number;
}
