import { NextResponse } from 'next/server';
import { normalizeSymbol } from '@market-reader/core';
import { aiEnabled, quoteBrief } from '@/lib/ai';

export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  if (!aiEnabled()) return NextResponse.json({ available: false });
  const symbol = normalizeSymbol((await params).symbol);
  try {
    return NextResponse.json({ available: true, ...(await quoteBrief(symbol)) });
  } catch (err) {
    return NextResponse.json({ available: true, error: (err as Error).message }, { status: 502 });
  }
}
