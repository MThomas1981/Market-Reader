export class ProviderError extends Error {
  constructor(public provider: string, message: string, public status?: number) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
  }
}

export async function getJSON<T>(provider: string, url: string, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new ProviderError(provider, `network error (${(err as Error).message})`);
  }
  if (res.status === 429) throw new ProviderError(provider, 'rate limit reached, try again in a minute', 429);
  if (res.status === 401 || res.status === 403) throw new ProviderError(provider, 'API key missing, invalid or not allowed for this data', res.status);
  if (!res.ok) throw new ProviderError(provider, `request failed with status ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Run async jobs with a concurrency cap; failed jobs resolve to null. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch {
        out[i] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}
