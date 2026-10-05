import type { Range } from './types';

export interface RangeSpec {
  /** Bar size */
  multiplier: number;
  timespan: 'minute' | 'hour' | 'day' | 'week';
  /** Start of the window, Unix ms */
  from: number;
  to: number;
  /** Calendar days covered (for providers that take "days") */
  days: number;
}

const DAY = 86_400_000;

/** Simple range spans (no lookback). Charts use chartWindow() in chart-window.ts, which matches these bar sizes. */
export function rangeSpec(range: Range, now = Date.now()): RangeSpec {
  const d = (days: number) => now - days * DAY;
  switch (range) {
    case '1D':
      // Look back 4 days so weekends and holidays still return the last session.
      return { multiplier: 5, timespan: 'minute', from: d(4), to: now, days: 1 };
    case '5D':
      return { multiplier: 15, timespan: 'minute', from: d(8), to: now, days: 7 };
    case '1M':
      return { multiplier: 1, timespan: 'hour', from: d(31), to: now, days: 30 };
    case '6M':
      return { multiplier: 1, timespan: 'day', from: d(183), to: now, days: 180 };
    case 'YTD': {
      const start = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
      return { multiplier: 1, timespan: 'day', from: start, to: now, days: Math.max(1, Math.ceil((now - start) / DAY)) };
    }
    case '1Y':
      return { multiplier: 1, timespan: 'day', from: d(365), to: now, days: 365 };
    case '5Y':
      return { multiplier: 1, timespan: 'day', from: d(5 * 365), to: now, days: 5 * 365 };
    case 'MAX':
      return { multiplier: 1, timespan: 'week', from: d(20 * 365), to: now, days: 20 * 365 };
  }
}

/** For 1D: keep only the most recent trading session in the returned bars. */
export function lastSession<T extends { time: number }>(bars: T[]): T[] {
  if (bars.length === 0) return bars;
  const lastDay = new Date(bars[bars.length - 1].time * 1000).toISOString().slice(0, 10);
  return bars.filter((b) => new Date(b.time * 1000).toISOString().slice(0, 10) === lastDay);
}

export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Combine daily bars into weekly bars (weeks start on Monday, UTC), so long ranges stay light. */
export function toWeekly<T extends { time: number; open: number; high: number; low: number; close: number; volume: number }>(bars: T[]): T[] {
  const out: T[] = [];
  let week = NaN;
  for (const b of bars) {
    const w = Math.floor((b.time / 86_400 + 3) / 7); // Unix day 0 was a Thursday
    const last = out[out.length - 1];
    if (w !== week || !last) {
      out.push({ ...b });
      week = w;
    } else {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    }
  }
  return out;
}
