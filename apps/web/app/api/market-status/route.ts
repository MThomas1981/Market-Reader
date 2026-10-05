import { market } from '@/lib/market';
import { ok } from '@/lib/http';

/** Is the US stock market open right now? Cached at the edge for 30 seconds. */
export async function GET() {
  return ok(await market.marketStatus(), 30);
}
