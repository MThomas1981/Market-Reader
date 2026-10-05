import { normalizeSymbol } from '@market-reader/core';
import { market } from '@/lib/market';
import { fail, ok } from '@/lib/http';

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = normalizeSymbol((await params).symbol);
  try {
    const [profile, earnings] = await Promise.all([market.profile(symbol), market.earnings(symbol).catch(() => [])]);
    return ok({ profile, earnings }, 3600);
  } catch (err) {
    return fail(err);
  }
}
