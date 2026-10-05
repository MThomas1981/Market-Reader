import { NextResponse } from 'next/server';
import { market } from '@/lib/market';
import { aiEnabled } from '@/lib/ai';
import { tradeHub } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

/**
 * Which data sources are set up. /api/status?check=1 also asks each source for a real price right now
 * and reports the real-time stream's state, to diagnose stale or inaccurate prices.
 */
export async function GET(req: Request) {
  const check = new URL(req.url).searchParams.has('check');
  const hub = tradeHub();
  return NextResponse.json(
    {
      data: market.status(),
      ai: aiEnabled() ? 'Claude API' : 'Not configured',
      stream: hub
        ? { state: hub.state, symbols: hub.symbolCount, lastTradeAt: hub.lastTradeAt, error: hub.lastError }
        : { state: 'off', reason: 'No FINNHUB_API_KEY' },
      ...(check && { health: await market.health() }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
