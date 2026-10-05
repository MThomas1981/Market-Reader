import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { accessToken } from './supabase';

/**
 * Watchlist on the phone. Stored on the device; when signed in it syncs with the account,
 * so it matches the web app. Free accounts hold 10 symbols, Pro 500.
 */
const KEY = 'market-reader.watchlist';
const DEFAULT = ['AAPL', 'NVDA', 'SPY', 'BTC-USD', 'EUR/USD'];
const listeners = new Set<(l: string[]) => void>();
let cache: string[] | null = null;
let synced = false;

function emit(list: string[]) {
  cache = list;
  listeners.forEach((l) => l(list));
  AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}

async function load(): Promise<string[]> {
  if (!cache) {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      cache = raw ? (JSON.parse(raw) as string[]) : DEFAULT;
    } catch {
      cache = DEFAULT;
    }
  }
  if (!synced && (await accessToken())) {
    synced = true;
    try {
      const remote = await api.myWatchlist();
      if (remote.symbols.length === 0 && cache.length) await api.saveWatchlist(cache);
      else emit(remote.symbols);
    } catch {
      synced = false;
    }
  }
  return cache;
}

/** Call after sign-in or sign-out so the next load re-syncs. */
export function resetWatchlistSync() {
  synced = false;
}

async function save(list: string[]): Promise<string | null> {
  const previous = cache ?? [];
  emit(list);
  if (!(await accessToken())) return null;
  try {
    await api.saveWatchlist(list);
    return null;
  } catch (e) {
    emit(previous);
    return (e as Error).message;
  }
}

export function useWatchlist() {
  const [list, setList] = useState<string[] | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    load().then(setList);
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  const toggle = useCallback(async (symbol: string) => {
    const l = await load();
    setError(await save(l.includes(symbol) ? l.filter((s) => s !== symbol) : [...l, symbol]));
  }, []);
  const remove = useCallback(async (symbol: string) => setError(await save((await load()).filter((s) => s !== symbol))), []);
  const refresh = useCallback(async () => setList(await load()), []);
  return { list, toggle, remove, refresh, error };
}
