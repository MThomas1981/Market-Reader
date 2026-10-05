'use client';

/**
 * Watchlist on the web. Guests keep it in this browser. Signed-in users sync it to their
 * account (Supabase), so it matches on the phone; the first sign-in carries the local list over.
 */
const KEY = 'market-reader.watchlist';
const EVENT = 'market-reader:watchlist';
const ERROR_EVENT = 'market-reader:watchlist-error';
export const DEFAULT_WATCHLIST = ['AAPL', 'NVDA', 'SPY', 'BTC-USD', 'EUR/USD'];

let remote = false;
let syncing: Promise<void> | null = null;

function readLocal(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : null;
  } catch {
    return null;
  }
}

function writeLocal(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: keep it for this page only */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: list }));
}

export function readWatchlist(): string[] {
  return readLocal() ?? DEFAULT_WATCHLIST;
}

async function put(list: string[]): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/me/watchlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbols: list }) });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: body.error ?? 'Your watchlist didn’t save.' };
}

/** Load the account's list if signed in. Safe to call from every component; runs once per page. */
export function syncWatchlist(): Promise<void> {
  syncing ??= (async () => {
    try {
      const res = await fetch('/api/me/watchlist', { cache: 'no-store' });
      if (!res.ok) return;
      remote = true;
      const { symbols } = (await res.json()) as { symbols: string[] };
      const local = readLocal();
      if (symbols.length === 0 && local && local.length) {
        const r = await put(local);
        if (r.ok) return writeLocal(local);
      }
      writeLocal(symbols);
    } catch {
      /* offline: keep local */
    }
  })();
  return syncing;
}

export async function writeWatchlist(list: string[]) {
  const previous = readWatchlist();
  writeLocal(list);
  if (!remote) return;
  const r = await put(list);
  if (!r.ok) {
    writeLocal(previous);
    window.dispatchEvent(new CustomEvent(ERROR_EVENT, { detail: r.error }));
  }
}

export function onWatchlistChange(cb: (list: string[]) => void, onError?: (message: string) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<string[]>).detail ?? readWatchlist());
  const err = (e: Event) => onError?.((e as CustomEvent<string>).detail);
  const storage = (e: StorageEvent) => e.key === KEY && cb(readWatchlist());
  window.addEventListener(EVENT, handler);
  window.addEventListener(ERROR_EVENT, err);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener(ERROR_EVENT, err);
    window.removeEventListener('storage', storage);
  };
}
