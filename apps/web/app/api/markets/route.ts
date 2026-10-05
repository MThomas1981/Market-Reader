import { market } from '@/lib/market';
import { fail, ok } from '@/lib/http';

export async function GET() {
  try {
    return ok(await market.overview(), 30);
  } catch (err) {
    return fail(err);
  }
}
