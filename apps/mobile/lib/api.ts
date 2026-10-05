import type {
  BacktestResult, EarningsResult, ForecastPoint, History, Horizon, Instrument, MarketOverview, NewsItem, Plan, PlanLimits,
  Profile, Quote, Range, RiskReturn, SearchResult, CagrRating } from '@market-reader/core';
import { symbolToPath } from '@market-reader/core';
import { accessToken } from './supabase';

/**
 * The phone talks to the Market Reader server (the web app's /api routes), never to data providers directly,
 * so API keys stay on the server. On a real phone, localhost is the phone itself: set EXPO_PUBLIC_API_URL
 * to your computer's network address, e.g. http://192.168.1.20:3000 (see README).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(`Can’t reach the Market Reader server at ${API_URL}. Is it running?`, 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}
const get = <T,>(path: string) => call<T>(path);

export interface Source { id: string; title: string; url: string }
export interface ForecastResponse {
  plan: Plan; lastPrice: number; lastDate: string; annualVolatility: number; source: string;
  points: ForecastPoint[]; locked: Horizon[]; accuracy: BacktestResult[] | null;
  cagr?: CagrRating;
  trend?: { pastYearAnnualPct: number; longRunCagrPct: number | null; longRunWeight: number; projectedAnnualPct: number };
}
export interface HistoryItem {
  symbol: string; name: string; firstSeenAt: string; lastSeenAt: string; views: number; saved: boolean;
  firstPrice: number | null; price: number | null; currency: string; changeSinceFirstPct: number | null;
}

export const api = {
  overview: () => get<MarketOverview>('/api/markets'),
  quote: (s: string) => get<{ instrument: Instrument; quote: Quote }>(`/api/quote/${symbolToPath(s)}`),
  quotes: (symbols: string[]) =>
    get<{ quotes: Quote[]; instruments: Instrument[] }>(`/api/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`),
  history: (s: string, range: Range) => get<History>(`/api/history/${symbolToPath(s)}?range=${range}`),
  profile: (s: string) => get<{ profile: Profile; earnings: EarningsResult[] }>(`/api/profile/${symbolToPath(s)}`),
  news: (s?: string) => get<{ news: NewsItem[] }>(`/api/news${s ? `?symbol=${encodeURIComponent(s)}` : ''}`),
  search: (q: string) => get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  brief: (s: string) => get<{ available: boolean; answer?: string; sources?: Source[]; error?: string }>(`/api/ai/brief/${symbolToPath(s)}`),
  forecast: (s: string) => get<ForecastResponse>(`/api/forecast/${symbolToPath(s)}`),
  analysis: (s: string) => get<{ stats: RiskReturn; benchmark: string | null }>(`/api/analysis/${symbolToPath(s)}`),
  me: () => get<{ user: { id: string; email: string | null } | null; plan: Plan; limits: PlanLimits; accounts: boolean }>('/api/me'),
  myWatchlist: () => get<{ symbols: string[]; limit: number }>('/api/me/watchlist'),
  saveWatchlist: (symbols: string[]) => call<{ symbols: string[] }>('/api/me/watchlist', { method: 'PUT', body: JSON.stringify({ symbols }) }),
  myHistory: () => get<{ items: HistoryItem[]; plan: Plan }>('/api/me/history'),
  recordView: (symbol: string) => call('/api/me/history', { method: 'POST', body: JSON.stringify({ symbol }) }).catch(() => null),
  ask: (messages: { role: 'user' | 'assistant'; content: string }[], symbol?: string) =>
    call<{ answer: string; sources: Source[]; remaining?: number }>('/api/ai', { method: 'POST', body: JSON.stringify({ messages, symbol }) }),
};
