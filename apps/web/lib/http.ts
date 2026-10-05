import { NextResponse } from 'next/server';
import { DEMO_SOURCE, ProviderError } from '@market-reader/core';

/**
 * Responses are cached on Vercel's edge network (s-maxage), so every visitor shares one fresh copy
 * and the free data plans aren't used up. Demo fallbacks are never cached, so real prices return
 * as soon as the source recovers.
 */
const hasDemo = (data: unknown) => JSON.stringify(data).includes(`"source":"${DEMO_SOURCE}"`);

export function ok<T>(data: T, maxAgeSeconds = 15) {
  const cache = hasDemo(data) ? 'no-store' : `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 4}`;
  return NextResponse.json(data, { headers: { 'Cache-Control': cache } });
}

/** For prices: at most `seconds` old at the edge, and never served stale beyond that window. */
export function live<T>(data: T, seconds = 5) {
  const cache = hasDemo(data) ? 'no-store' : `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;
  return NextResponse.json(data, { headers: { 'Cache-Control': cache } });
}

export function fail(err: unknown) {
  const status = err instanceof ProviderError && err.status === 404 ? 404 : err instanceof ProviderError && err.status === 429 ? 429 : 502;
  const message = err instanceof Error ? err.message : 'Something went wrong loading market data.';
  return NextResponse.json({ error: message }, { status });
}
