import { NextResponse } from 'next/server';
import { analyze, normalizeSymbol } from '@market-reader/core';
import { market } from '@/lib/market';
import { getViewer } from '@/lib/viewer';

/** Deeper analysis (Pro): one year of risk and return, drawdowns, and beta against the S&P 500 (via SPY). */
export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = normalizeSymbol((await params).symbol);
  const v = await getViewer(req);
  if (!v.limits.deepAnalysis) {
    return NextResponse.json(
      { error: 'Deeper analysis is part of Pro.', plan: v.plan, upgrade: '/pricing' },
      { status: 402, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  const inst = market.instrument(symbol);
  try {
    const [history, bench] = await Promise.all([
      market.history(symbol, '1Y'),
      symbol === 'SPY' ? Promise.resolve(null) : market.history('SPY', '1Y').catch(() => null),
    ]);
    const stats = analyze(history.candles, bench?.candles, { everyDay: inst.assetClass === 'crypto' });
    return NextResponse.json(
      { symbol, benchmark: bench ? 'SPY' : null, source: history.source, stats },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
