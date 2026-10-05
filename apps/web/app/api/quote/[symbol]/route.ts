import { normalizeSymbol } from '@market-reader/core';
import { market } from '@/lib/market';
import { fail, live } from '@/lib/http';

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = normalizeSymbol((await params).symbol);
  try {
    const quote = await market.quote(symbol);
    return live({ instrument: market.instrument(symbol), quote });
  } catch (err) {
    return fail(err);
  }
}
