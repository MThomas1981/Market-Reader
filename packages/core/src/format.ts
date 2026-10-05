const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', CNY: '¥', HKD: 'HK$', INR: '₹', MXN: 'MX$' };

/** Decimals that suit the size of the number: 4 for FX-like, 2 for stocks, up to 6 for tiny coins. */
export function decimalsFor(value: number): number {
  const v = Math.abs(value);
  if (v === 0) return 2;
  if (v < 0.01) return 6;
  if (v < 1) return 4;
  if (v < 10) return 4;
  return 2;
}

export function formatNumber(value: number | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const d = decimals ?? decimalsFor(value);
  return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatPrice(value: number | null | undefined, currency = 'USD', opts: { forex?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const n = formatNumber(value, opts.forex ? 4 : undefined);
  if (opts.forex) return n;
  const sym = SYMBOLS[currency];
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

export function formatChange(value: number | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const s = formatNumber(Math.abs(value), decimals);
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${s}`;
}

export function formatPercent(value: number | null | undefined, signed = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const s = Math.abs(value).toFixed(2);
  if (!signed) return `${s}%`;
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${s}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const v = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (v >= 1e12) return `${sign}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${sign}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(1)}K`;
  return `${sign}${v.toFixed(0)}`;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export const direction = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
