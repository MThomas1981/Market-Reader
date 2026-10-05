import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { billingEnabled, customerFor, siteUrl, stripe } from '@/lib/billing';

/** Open Stripe's billing portal: change card, see invoices, cancel. Returns { url }. */
export async function POST(req: Request) {
  if (!billingEnabled()) return NextResponse.json({ error: 'Payments aren’t set up yet.' }, { status: 503 });
  const v = await getViewer(req);
  if (!v.user && !v.guestPro) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  try {
    const customer = v.user ? await customerFor(v.user) : v.guestPro!.cus;
    const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${siteUrl(req)}/account` });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = (err as Error).message;
    const hint = /configuration/i.test(msg) ? ' Turn on the customer portal in the Stripe dashboard (test mode): Settings > Billing > Customer portal. You can also use "Cancel Pro" on this page.' : '';
    return NextResponse.json({ error: `Stripe: ${msg}${hint}` }, { status: 502 });
  }
}
