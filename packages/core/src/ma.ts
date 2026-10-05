/**
 * Moving-average lines for charts: configuration, colors and the lookback each set needs.
 * The math lives in indicators.ts (sma: rolling arithmetic mean; ema: SMA seed, then smoothing).
 */
import { ema, sma, type Series } from './indicators';

export type MAType = 'SMA' | 'EMA';

export interface MALine {
  id: string;
  type: MAType;
  period: number;
  color: string;
  on: boolean;
}

export const MIN_MA_PERIOD = 2;
export const MAX_MA_PERIOD = 500;

/** Distinct from the chart's green/red price colors and from each other. SMA solid, EMA dashed. */
export const MA_COLORS = ['#d18b1f', '#8a4fd1', '#1f6fb8', '#c2417f', '#1a9a9a', '#7a6a1f', '#5b6878', '#b8541f'];

export const DEFAULT_MA_LINES: MALine[] = [
  { id: 'sma20', type: 'SMA', period: 20, color: MA_COLORS[0], on: false },
  { id: 'sma50', type: 'SMA', period: 50, color: MA_COLORS[1], on: true },
  { id: 'sma200', type: 'SMA', period: 200, color: MA_COLORS[2], on: true },
  { id: 'ema20', type: 'EMA', period: 20, color: MA_COLORS[3], on: false },
  { id: 'ema50', type: 'EMA', period: 50, color: MA_COLORS[4], on: false },
];

export const clampPeriod = (n: number): number =>
  Math.min(MAX_MA_PERIOD, Math.max(MIN_MA_PERIOD, Math.round(Number.isFinite(n) ? n : 20)));

export const maLabel = (l: Pick<MALine, 'type' | 'period'>) => `${l.type} ${l.period}`;

export function movingAverage(type: MAType, closes: number[], period: number): Series {
  return type === 'EMA' ? ema(closes, period) : sma(closes, period);
}

/**
 * Bars of history needed before the first visible bar so every active indicator has a value there.
 * EMA: the SMA seed needs `period` bars, plus as many again so the seed has mostly washed out.
 */
export function lookbackFor(lines: MALine[], extra: { bollinger?: boolean; rsi?: boolean; macd?: boolean } = {}): number {
  let n = 0;
  for (const l of lines) if (l.on) n = Math.max(n, l.type === 'EMA' ? Math.min(MAX_MA_PERIOD, l.period * 2) : l.period);
  if (extra.bollinger) n = Math.max(n, 20);
  if (extra.rsi) n = Math.max(n, 15);
  if (extra.macd) n = Math.max(n, 35);
  return Math.min(MAX_MA_PERIOD, n);
}

/** Validate lines read from storage or typed by a user. */
export function sanitizeLines(input: unknown): MALine[] {
  if (!Array.isArray(input)) return DEFAULT_MA_LINES;
  const out: MALine[] = [];
  for (const raw of input.slice(0, 8)) {
    const l = raw as Partial<MALine>;
    if (l?.type !== 'SMA' && l?.type !== 'EMA') continue;
    out.push({
      id: typeof l.id === 'string' && l.id ? l.id : `ma${out.length}`,
      type: l.type,
      period: clampPeriod(Number(l.period)),
      color: typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : MA_COLORS[out.length % MA_COLORS.length],
      on: !!l.on,
    });
  }
  return out.length ? out : DEFAULT_MA_LINES;
}
