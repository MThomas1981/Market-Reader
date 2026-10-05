/**
 * Small in-memory TTL cache with request de-duplication.
 * Keeps us under free-tier rate limits: many users asking for AAPL within
 * the TTL cost one provider call. Swap for Redis/Upstash when running several servers.
 */
export class TTLCache {
  private store = new Map<string, { value: unknown; expires: number }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private maxEntries = 2000) {}

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  /**
   * Cached value, or the result of `load()` (shared by concurrent callers).
   * `ttlFor` can shorten the lifetime of particular results, e.g. a fallback after a provider error.
   */
  async wrap<T>(key: string, ttlMs: number, load: () => Promise<T>, ttlFor?: (value: T) => number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const p = load()
      .then((value) => {
        this.set(key, value, ttlFor ? ttlFor(value) : ttlMs);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
