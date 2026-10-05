import type { AssetClass, Instrument } from './types';

const us = (symbol: string, name: string, assetClass: AssetClass = 'stock', exchange = 'NASDAQ'): Instrument => ({
  symbol, name, assetClass, exchange, currency: 'USD', country: 'US',
});
const crypto = (symbol: string, name: string, coingecko: string): Instrument => ({
  symbol, name, assetClass: 'crypto', exchange: 'Crypto', currency: 'USD', country: 'Global', providerIds: { coingecko },
});
const fx = (base: string, quote: string, name: string): Instrument => ({
  symbol: `${base}/${quote}`, name, assetClass: 'forex', exchange: 'FX', currency: quote, country: 'Global',
});
const intl = (symbol: string, name: string, exchange: string, currency: string, country: string): Instrument => ({
  symbol, name, assetClass: 'stock', exchange, currency, country,
});

/** Index trackers: free data tiers don't carry the indexes themselves, so ETFs stand in. */
export const INDEX_PROXIES: Instrument[] = [
  { ...us('SPY', 'S&P 500', 'etf', 'NYSE Arca') },
  { ...us('QQQ', 'Nasdaq 100', 'etf') },
  { ...us('DIA', 'Dow Jones 30', 'etf', 'NYSE Arca') },
  { ...us('IWM', 'Russell 2000', 'etf', 'NYSE Arca') },
];

export const US_STOCKS: Instrument[] = [
  us('AAPL', 'Apple Inc.'), us('MSFT', 'Microsoft Corp.'), us('NVDA', 'NVIDIA Corp.'),
  us('GOOGL', 'Alphabet Inc. Class A'), us('AMZN', 'Amazon.com Inc.'), us('META', 'Meta Platforms Inc.'),
  us('TSLA', 'Tesla Inc.'), us('AVGO', 'Broadcom Inc.'), us('AMD', 'Advanced Micro Devices'),
  us('NFLX', 'Netflix Inc.'), us('ADBE', 'Adobe Inc.'), us('CRM', 'Salesforce Inc.', 'stock', 'NYSE'),
  us('ORCL', 'Oracle Corp.', 'stock', 'NYSE'), us('INTC', 'Intel Corp.'), us('JPM', 'JPMorgan Chase & Co.', 'stock', 'NYSE'), us('BRK.B', 'Berkshire Hathaway Inc. Class B', 'stock', 'NYSE'), us('BRK.A', 'Berkshire Hathaway Inc. Class A', 'stock', 'NYSE'),
  us('V', 'Visa Inc.', 'stock', 'NYSE'), us('MA', 'Mastercard Inc.', 'stock', 'NYSE'), us('BAC', 'Bank of America', 'stock', 'NYSE'),
  us('WMT', 'Walmart Inc.', 'stock', 'NYSE'), us('COST', 'Costco Wholesale'), us('KO', 'Coca-Cola Co.', 'stock', 'NYSE'),
  us('PEP', 'PepsiCo Inc.'), us('DIS', 'Walt Disney Co.', 'stock', 'NYSE'), us('NKE', 'Nike Inc.', 'stock', 'NYSE'),
  us('XOM', 'Exxon Mobil Corp.', 'stock', 'NYSE'), us('CVX', 'Chevron Corp.', 'stock', 'NYSE'), us('UNH', 'UnitedHealth Group', 'stock', 'NYSE'),
  us('JNJ', 'Johnson & Johnson', 'stock', 'NYSE'), us('LLY', 'Eli Lilly & Co.', 'stock', 'NYSE'), us('PFE', 'Pfizer Inc.', 'stock', 'NYSE'),
  us('BA', 'Boeing Co.', 'stock', 'NYSE'), us('UBER', 'Uber Technologies', 'stock', 'NYSE'),
];

export const ETFS: Instrument[] = [
  ...INDEX_PROXIES,
  us('VTI', 'Vanguard Total Stock Market ETF', 'etf', 'NYSE Arca'),
  us('VOO', 'Vanguard S&P 500 ETF', 'etf', 'NYSE Arca'),
  us('VXUS', 'Vanguard Total International Stock ETF'),
  us('BND', 'Vanguard Total Bond Market ETF'),
  us('GLD', 'SPDR Gold Shares', 'etf', 'NYSE Arca'),
  us('XLK', 'Technology Select Sector SPDR', 'etf', 'NYSE Arca'),
  us('XLE', 'Energy Select Sector SPDR', 'etf', 'NYSE Arca'),
  us('ARKK', 'ARK Innovation ETF', 'etf', 'NYSE Arca'),
];

export const CRYPTO: Instrument[] = [
  crypto('BTC-USD', 'Bitcoin', 'bitcoin'), crypto('ETH-USD', 'Ethereum', 'ethereum'),
  crypto('SOL-USD', 'Solana', 'solana'), crypto('XRP-USD', 'XRP', 'ripple'),
  crypto('BNB-USD', 'BNB', 'binancecoin'), crypto('DOGE-USD', 'Dogecoin', 'dogecoin'),
  crypto('ADA-USD', 'Cardano', 'cardano'), crypto('AVAX-USD', 'Avalanche', 'avalanche-2'),
  crypto('LINK-USD', 'Chainlink', 'chainlink'), crypto('LTC-USD', 'Litecoin', 'litecoin'),
];

export const FOREX: Instrument[] = [
  fx('EUR', 'USD', 'Euro / US Dollar'), fx('USD', 'JPY', 'US Dollar / Japanese Yen'),
  fx('GBP', 'USD', 'British Pound / US Dollar'), fx('USD', 'CAD', 'US Dollar / Canadian Dollar'),
  fx('AUD', 'USD', 'Australian Dollar / US Dollar'), fx('USD', 'CHF', 'US Dollar / Swiss Franc'),
  fx('USD', 'CNY', 'US Dollar / Chinese Yuan'), fx('USD', 'MXN', 'US Dollar / Mexican Peso'),
];

/** International listings. Free tiers rarely cover these; they use demo data until a paid source is added. */
export const INTERNATIONAL: Instrument[] = [
  intl('SHOP.TO', 'Shopify Inc.', 'TSX', 'CAD', 'Canada'),
  intl('RY.TO', 'Royal Bank of Canada', 'TSX', 'CAD', 'Canada'),
  intl('7203.T', 'Toyota Motor Corp.', 'Tokyo', 'JPY', 'Japan'),
  intl('SAP.DE', 'SAP SE', 'Xetra', 'EUR', 'Germany'),
  intl('ASML.AS', 'ASML Holding', 'Euronext Amsterdam', 'EUR', 'Netherlands'),
  intl('HSBA.L', 'HSBC Holdings', 'London', 'GBP', 'United Kingdom'),
  intl('0700.HK', 'Tencent Holdings', 'Hong Kong', 'HKD', 'Hong Kong'),
  intl('RELIANCE.NS', 'Reliance Industries', 'NSE', 'INR', 'India'),
];

export const UNIVERSE: Instrument[] = [...US_STOCKS, ...ETFS, ...CRYPTO, ...FOREX, ...INTERNATIONAL];

const bySymbol = new Map(UNIVERSE.map((i) => [i.symbol, i]));

/** Normalise user input: "btc" → BTC-USD, "eurusd" → EUR/USD, "aapl" → AAPL. */
export function normalizeSymbol(input: string): string {
  const raw = decodeURIComponent(input).trim().toUpperCase();
  if (bySymbol.has(raw)) return raw;
  const compact = raw.replace(/[\s/_-]/g, '');
  if (/^[A-Z]{6}$/.test(compact) && bySymbol.has(`${compact.slice(0, 3)}/${compact.slice(3)}`)) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }
  if (bySymbol.has(`${raw}-USD`)) return `${raw}-USD`;
  return raw;
}

export function findInstrument(symbol: string): Instrument | undefined {
  return bySymbol.get(normalizeSymbol(symbol));
}

/** Best guess for symbols outside the built-in list. */
/** Exchange suffixes used by Finnhub and Yahoo-style symbols for non-US listings: [market, currency, country]. */
const FOREIGN_SUFFIXES: Record<string, [string, string, string]> = {
  TO: ['TSX', 'CAD', 'Canada'], V: ['TSX Venture', 'CAD', 'Canada'], NE: ['Cboe Canada', 'CAD', 'Canada'],
  L: ['London', 'GBP', 'United Kingdom'], DE: ['XETRA', 'EUR', 'Germany'], F: ['Frankfurt', 'EUR', 'Germany'],
  PA: ['Euronext Paris', 'EUR', 'France'], AS: ['Euronext Amsterdam', 'EUR', 'Netherlands'], BR: ['Euronext Brussels', 'EUR', 'Belgium'],
  MI: ['Borsa Italiana', 'EUR', 'Italy'], MC: ['Madrid', 'EUR', 'Spain'], SW: ['SIX Swiss', 'CHF', 'Switzerland'],
  ST: ['Stockholm', 'SEK', 'Sweden'], CO: ['Copenhagen', 'DKK', 'Denmark'], OL: ['Oslo', 'NOK', 'Norway'], HE: ['Helsinki', 'EUR', 'Finland'],
  T: ['Tokyo', 'JPY', 'Japan'], HK: ['Hong Kong', 'HKD', 'Hong Kong'], SS: ['Shanghai', 'CNY', 'China'], SZ: ['Shenzhen', 'CNY', 'China'],
  KS: ['Korea', 'KRW', 'South Korea'], KQ: ['KOSDAQ', 'KRW', 'South Korea'], TW: ['Taiwan', 'TWD', 'Taiwan'], AX: ['ASX', 'AUD', 'Australia'],
  NZ: ['NZX', 'NZD', 'New Zealand'], NS: ['NSE India', 'INR', 'India'], BO: ['BSE India', 'INR', 'India'], SA: ['B3', 'BRL', 'Brazil'],
  MX: ['Mexico', 'MXN', 'Mexico'], JO: ['Johannesburg', 'ZAR', 'South Africa'], SI: ['Singapore', 'SGD', 'Singapore'],
};

export function instrumentFor(symbol: string): Instrument {
  const s = normalizeSymbol(symbol);
  const known = bySymbol.get(s);
  if (known) return known;
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(s)) return fx(s.slice(0, 3), s.slice(4), s);
  if (/-USD$/.test(s)) return crypto(s, s.replace('-USD', ''), s.replace('-USD', '').toLowerCase());
  // A dot is a foreign exchange suffix (SHOP.TO, 7203.T) only for known suffixes; otherwise it is a
  // US share class such as BRK.B or BF.B, which must be priced from the US feed.
  const suffix = s.includes('.') ? s.split('.').pop()! : '';
  if (FOREIGN_SUFFIXES[suffix]) {
    const [market, currency, country] = FOREIGN_SUFFIXES[suffix];
    return intl(s, s, market, currency, country);
  }
  return us(s, s);
}

/** URL-safe form of a symbol: EUR/USD → EURUSD (normalizeSymbol turns it back). */
export const symbolToPath = (symbol: string) => encodeURIComponent(symbol.replace('/', ''));
