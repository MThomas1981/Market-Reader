import { NextResponse } from 'next/server';
import { stripe } from '@/lib/billing';
import { getViewer } from '@/lib/viewer';
import { forgetGuestPro, PRO_COOKIE } from '@/lib/guest-pro';

/** Cancel Pro bought without an account: ends the Stripe test subscription now and clears this browser's Pro. */
export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!v.guestPro) return NextResponse.json({ error: 'There is no Pro plan on this browser to cancel.' }, { status: 404 });
  try {
    await stripe().subscriptions.cancel(v.guestPro.sub);
  } catch (err) {
    const msg = (err as Error).message;
    if (!/No such subscription|canceled/i.test(msg)) return NextResponse.json({ error: `Stripe: ${msg}` }, { status: 502 });
  }
  forgetGuestPro(v.guestPro.sub);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PRO_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
