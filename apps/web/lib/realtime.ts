import 'server-only';

/**
 * Real-time US stock trades from Finnhub's WebSocket (wss://ws.finnhub.io), shared by every visitor.
 *
 * The server keeps ONE upstream connection and fans trades out to browsers over Server-Sent Events
 * (app/api/stream). That keeps the API key on the server, stays inside the free plan's connection and
 * symbol limits, and works on Vercel, where each function instance holds its own shared connection.
 */
export interface Trade {
  /** Symbol, e.g. AAPL */
  s: string;
  /** Last trade price */
  p: number;
  /** Trade time, Unix ms */
  t: number;
  /** Shares in the trade */
  v: number;
}
type Listener = (t: Trade) => void;
export type HubState = 'idle' | 'connecting' | 'open' | 'retrying';

const MAX_SYMBOLS = 50; // Finnhub free plan limit per connection

class TradeHub {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  state: HubState = 'idle';
  lastError: string | null = null;
  lastTradeAt: number | null = null;
  /** Latest trade per symbol, so a new viewer gets a price immediately. */
  readonly latest = new Map<string, Trade>();

  constructor(private apiKey: string) {}

  get symbolCount() {
    return this.listeners.size;
  }

  subscribe(symbols: string[], fn: Listener): () => void {
    for (const s of symbols) {
      let set = this.listeners.get(s);
      if (!set) {
        if (this.listeners.size >= MAX_SYMBOLS) continue;
        set = new Set();
        this.listeners.set(s, set);
        this.send({ type: 'subscribe', symbol: s });
      }
      set.add(fn);
    }
    this.connect();
    return () => {
      for (const s of symbols) {
        const set = this.listeners.get(s);
        if (!set) continue;
        set.delete(fn);
        if (set.size === 0) {
          this.listeners.delete(s);
          this.send({ type: 'unsubscribe', symbol: s });
        }
      }
      if (this.listeners.size === 0) this.disconnect();
    };
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private connect() {
    if (this.ws || this.retryTimer || typeof WebSocket === 'undefined') return;
    this.state = 'connecting';
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(this.apiKey)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.state = 'open';
      this.retries = 0;
      this.lastError = null;
      for (const s of this.listeners.keys()) this.send({ type: 'subscribe', symbol: s });
    };
    ws.onmessage = (e) => {
      let msg: { type?: string; data?: Trade[]; msg?: string };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === 'error') this.lastError = msg.msg ?? 'Finnhub reported an error';
      if (msg.type !== 'trade' || !msg.data) return;
      // A message can hold many trades; pass on only the newest per symbol.
      const newest = new Map<string, Trade>();
      for (const t of msg.data) {
        const prev = newest.get(t.s);
        if (!prev || t.t >= prev.t) newest.set(t.s, t);
      }
      for (const t of newest.values()) {
        const seen = this.latest.get(t.s);
        if (seen && seen.t > t.t) continue; // ignore late, out-of-order prints
        this.latest.set(t.s, t);
        this.lastTradeAt = Date.now();
        for (const fn of this.listeners.get(t.s) ?? []) fn(t);
      }
    };
    ws.onerror = () => {
      this.lastError ??= 'Could not reach Finnhub’s real-time feed';
    };
    ws.onclose = (e) => {
      this.ws = null;
      if (e.code === 1008 || e.code === 4001 || /key|token|auth/i.test(e.reason)) this.lastError = 'Finnhub refused the API key';
      if (this.listeners.size === 0) {
        this.state = 'idle';
        return;
      }
      this.state = 'retrying';
      const wait = Math.min(30_000, 1000 * 2 ** this.retries++);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.connect();
      }, wait);
    };
  }

  private disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close();
    this.ws = null;
    this.state = 'idle';
  }
}

// One hub per server process (kept across hot reloads in development).
const g = globalThis as unknown as { __marketReaderTradeHub?: TradeHub | null };
export function tradeHub(): TradeHub | null {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || process.env.MARKET_READER_DEMO === 'true') return null;
  g.__marketReaderTradeHub ??= new TradeHub(key);
  return g.__marketReaderTradeHub;
}
