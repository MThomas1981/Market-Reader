/**
 * Chart windows: which bar size each display range uses, how far back to fetch so moving averages are
 * already "warmed up" at the first visible bar, and where the visible part of a fetched series starts.
 *
 *   range  →  resolution            visible span
 *   1D        5-minute              last trading session (crypto: last 24 hours)
 *   5D        15-minute             last 5 trading sessions (crypto: last 5 days)
 *   1M        1-hour                last 31 days
 *   6M        daily                 last 183 days
 *   YTD       daily                 since 1 January
 *   1Y        daily                 last 365 days
 *   5Y        daily (crypto weekly) last 5 years
 *   MAX       weekly                all history
 *
 * Lookback: to draw a 200-period average from the first visible bar, 200 earlier bars are fetched too.
 * The calendar time that holds N bars depends on trading hours, so it is estimated generously
 * (an over-fetch costs a few extra bars; an under-fetch would leave a gap).
 */
import type { AssetClass, Candle, Range } from './types';
import { newYorkClock } from './market-hours';

export type Timespan = 'minute' | 'hour' | 'day' | 'week';

export interface Resolution {
  multiplier: number;
  timespan: Timespan;
  /** Bar length in seconds */
  seconds: number;
  /** For people: "5-minute bars" */
  label: string;
}

/** us-equity: weekday sessions · weekdays: Monday–Friday around the clock (currencies) · always: 24/7 (crypto) */
export type MarketHours = 'us-equity' | 'weekdays' | 'always';

const UNIT: Record<Timespan, number> = { minute: 60, hour: 3_600, day: 86_400, week: 604_800 };
const res = (multiplier: number, timespan: Timespan, label: string): Resolution => ({
  multiplier, timespan, seconds: multiplier * UNIT[timespan], label,
});

export const RESOLUTIONS = {
  m5: res(5, 'minute', '5-minute bars'),
  m15: res(15, 'minute', '15-minute bars'),
  h1: res(1, 'hour', '1-hour bars'),
  d1: res(1, 'day', 'daily bars'),
  w1: res(1, 'week', 'weekly bars'),
} as const;

/** The standard mapping from display range to bar size. */
export const RANGE_RESOLUTION: Record<Range, Resolution> = {
  '1D': RESOLUTIONS.m5,
  '5D': RESOLUTIONS.m15,
  '1M': RESOLUTIONS.h1,
  '6M': RESOLUTIONS.d1,
  YTD: RESOLUTIONS.d1,
  '1Y': RESOLUTIONS.d1,
  '5Y': RESOLUTIONS.d1,
  MAX: RESOLUTIONS.w1,
};

export const marketHoursFor = (assetClass: AssetClass): MarketHours =>
  assetClass === 'crypto' ? 'always' : assetClass === 'forex' ? 'weekdays' : 'us-equity';

/**
 * Bar size for a range and asset. Same as RANGE_RESOLUTION except where free data can't supply it:
 * currencies only have daily reference rates, and crypto's free 5-year history is weekly.
 */
export function resolutionFor(range: Range, assetClass: AssetClass): Resolution {
  if (assetClass === 'forex') return range === 'MAX' ? RESOLUTIONS.w1 : RESOLUTIONS.d1;
  if (assetClass === 'crypto' && range === '5Y') return RESOLUTIONS.w1;
  return RANGE_RESOLUTION[range];
}

/** Lookback requests are rounded up to these sizes so the server can share cached results. */
export const LOOKBACK_BUCKETS = [0, 20, 50, 100, 200, 300, 500] as const;
export const MAX_LOOKBACK = 500;
export const lookbackBucket = (bars: number): number =>
  LOOKBACK_BUCKETS.find((b) => b >= Math.max(0, Math.ceil(bars || 0))) ?? MAX_LOOKBACK;

const DAY = 86_400_000;

/** Calendar milliseconds that are sure to contain `bars` bars of this resolution. */
export function lookbackSpan(bars: number, resolution: Resolution, hours: MarketHours): number {
  if (bars <= 0) return 0;
  if (hours === 'always') return Math.ceil(bars * resolution.seconds * 1000 * 1.02) + DAY;
  if (resolution.timespan === 'week') return (bars + 2) * 7 * DAY;
  if (resolution.timespan === 'day') return Math.ceil((bars * 7) / 5 * 1.05 + 5) * DAY; // weekends and holidays
  // Intraday: assume only the 6.5-hour regular session trades (stocks) so we never fetch too little.
  const perDay = hours === 'us-equity' ? 390 * 60 : 86_400;
  const tradingDays = Math.ceil((bars * resolution.seconds) / perDay);
  return Math.ceil((tradingDays * 7) / 5 + 4) * DAY;
}

/** Calendar start of the visible range (1D/5D are trimmed to whole sessions later). null = all history. */
export function visibleStart(range: Range, assetClass: AssetClass, now = Date.now()): number | null {
  if (assetClass === 'forex' && (range === '1D' || range === '5D')) return now - 14 * DAY; // daily rates only
  switch (range) {
    case '1D': return now - (assetClass === 'crypto' ? 1 : 4) * DAY;
    case '5D': return now - (assetClass === 'crypto' ? 5 : 9) * DAY;
    case '1M': return now - 31 * DAY;
    case '6M': return now - 183 * DAY;
    case 'YTD': return Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
    case '1Y': return now - 365 * DAY;
    case '5Y': return now - (5 * 365 + 1) * DAY;
    case 'MAX': return null;
  }
}

export interface ChartWindow {
  range: Range;
  resolution: Resolution;
  hours: MarketHours;
  /** Extra bars fetched before the visible range */
  lookbackBars: number;
  /** Fetch from this time (Unix ms); 0 means from the very beginning */
  from: number;
  to: number;
  /** Visible range starts here (Unix ms); null for all history */
  visibleStart: number | null;
}

export function chartWindow(range: Range, assetClass: AssetClass, lookbackBars = 0, now = Date.now()): ChartWindow {
  const resolution = resolutionFor(range, assetClass);
  const hours = marketHoursFor(assetClass);
  const start = visibleStart(range, assetClass, now);
  const lookback = lookbackBucket(lookbackBars);
  const from = start === null ? 0 : Math.max(0, start - lookbackSpan(lookback, resolution, hours));
  return { range, resolution, hours, lookbackBars: lookback, from, to: now, visibleStart: start };
}

/** Number of bars a window spans, used to decide whether a source with a bar limit can serve it. */
export const windowBars = (w: ChartWindow): number => Math.ceil((w.to - (w.from || 0)) / 1000 / w.resolution.seconds);

/**
 * Index of the first visible candle in a fetched series (buffer bars come before it).
 * 1D and 5D for stocks keep the last 1 or 5 trading sessions by New York date, including
 * pre-market and after-hours bars of those days.
 */
export function firstVisibleIndex(candles: Candle[], w: ChartWindow): number {
  if (candles.length === 0 || w.visibleStart === null) return 0;
  if (w.hours === 'us-equity' && (w.range === '1D' || w.range === '5D')) {
    const sessions = w.range === '1D' ? 1 : 5;
    const dates: string[] = [];
    for (let i = candles.length - 1; i >= 0; i--) {
      const d = newYorkClock(candles[i].time * 1000).date;
      if (dates[dates.length - 1] !== d) {
        if (dates.length === sessions) return i + 1;
        dates.push(d);
      }
    }
    return 0;
  }
  const startSec = w.visibleStart / 1000;
  const i = candles.findIndex((c) => c.time >= startSec);
  return i === -1 ? candles.length - 1 : i;
}

/** Index of the first visible candle given a History's visibleFrom (Unix seconds). */
export function visibleIndex(candles: { time: number }[], visibleFrom: number | undefined): number {
  if (visibleFrom === undefined || candles.length === 0) return 0;
  const i = candles.findIndex((c) => c.time >= visibleFrom);
  return i === -1 ? candles.length - 1 : i;
}
