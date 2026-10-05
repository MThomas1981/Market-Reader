import { market } from '@/lib/market';
import { fail, ok } from '@/lib/http';

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 60);
  try {
    return ok({ results: await market.search(q) }, 3600);
  } catch (err) {
    return fail(err);
  }
}
