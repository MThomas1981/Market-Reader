/**
 * US stock market hours (NYSE and Nasdaq), in New York time, so the app can say whether a price is
 * moving right now or is the last close. Finnhub's market-status feed is used when a key is set;
 * this calendar is the fallback and also covers early closes.
 */
export type MarketSession = 'pre-market' | 'regular' | 'after-hours' | 'closed';

export interface MarketStatus {
  session: MarketSession;
  isOpen: boolean;
  /** Holiday name when the market is shut for one */
  holiday: string | null;
  /** Unix ms of the next regular-session open or close */
  nextChange: number | null;
  source: string;
}

/** NYSE full-day closures, YYYY-MM-DD in New York time. */
export const US_HOLIDAYS: Record<string, string> = {
  '2026-01-01': "New Year's Day", '2026-01-19': 'Martin Luther King Jr. Day', '2026-02-16': "Washington's Birthday",
  '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth', '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving Day', '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day", '2027-01-18': 'Martin Luther King Jr. Day', '2027-02-15': "Washington's Birthday",
  '2027-03-26': 'Good Friday', '2027-05-31': 'Memorial Day', '2027-06-18': 'Juneteenth (observed)', '2027-07-05': 'Independence Day (observed)',
  '2027-09-06': 'Labor Day', '2027-11-25': 'Thanksgiving Day', '2027-12-24': 'Christmas Day (observed)',
};

/** Days the regular session ends at 1:00 p.m. New York time. */
export const US_EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const EARLY_CLOSE = 13 * 60;
const PRE = 4 * 60;
const POST = 20 * 60;

const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});

/** Date, weekday and minutes since midnight in New York for a moment in time. */
export function newYorkClock(now: number) {
  const parts = Object.fromEntries(NY.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday as string,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const isTradingDay = (date: string, weekday: string) => weekday !== 'Sat' && weekday !== 'Sun' && !US_HOLIDAYS[date];

/** Market session from the calendar alone. */
export function usMarketSession(now = Date.now()): MarketStatus {
  const { date, weekday, minutes } = newYorkClock(now);
  const holiday = US_HOLIDAYS[date] ?? null;
  const close = US_EARLY_CLOSES.has(date) ? EARLY_CLOSE : CLOSE;
  let session: MarketSession = 'closed';
  if (isTradingDay(date, weekday)) {
    if (minutes >= OPEN && minutes < close) session = 'regular';
    else if (minutes >= PRE && minutes < OPEN) session = 'pre-market';
    else if (minutes >= close && minutes < POST) session = 'after-hours';
  }
  return { session, isOpen: session === 'regular', holiday, nextChange: nextRegularChange(now), source: 'Market calendar' };
}

/** Next regular-session open (when closed) or close (when open), searched in 15-minute steps. */
function nextRegularChange(now: number): number | null {
  const step = 15 * 60_000;
  const start = Math.ceil(now / step) * step;
  const openNow = isRegularOpen(now);
  for (let t = start; t < now + 8 * 86_400_000; t += step) {
    if (isRegularOpen(t) !== openNow) return t;
  }
  return null;
}

function isRegularOpen(now: number): boolean {
  const { date, weekday, minutes } = newYorkClock(now);
  const close = US_EARLY_CLOSES.has(date) ? EARLY_CLOSE : CLOSE;
  return isTradingDay(date, weekday) && minutes >= OPEN && minutes < close;
}

/** True when a moment falls inside the regular 9:30–4:00 (or early-close) session. */
export function isRegularSessionTime(ms: number): boolean {
  return isRegularOpen(ms);
}
