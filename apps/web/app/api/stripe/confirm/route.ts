import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { billingEnabled, siteUrl, stripe } from '@/lib/billing';
import { encodeGuestPro, periodEnd, proCookieOptions, PRO_COOKIE } from '@/lib/guest-pro';

/**
 * Stripe Checkout returns here after paying (accounts off). The payment is confirmed with Stripe on the
 * server, never trusted from the URL, and then Pro is switched on for this browser.
 */
export async function GET(req: Request) {
  const site = siteUrl(req);
  const id = new URL(req.url).searchParams.get('session_id');
  if (!billingEnabled() || !id) return NextResponse.redirect(`${site}/pricing`);
  try {
    const session = await stripe().checkout.sessions.retrieve(id, { expand: ['subscription'] });
    const sub = session.subscription as Stripe.Subscription | null;
    const paid = session.status === 'complete' && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
    if (!paid || !sub || typeof session.customer !== 'string') return NextResponse.redirect(`${site}/pricing?payment=incomplete`);
    const exp = periodEnd(sub);
    const res = NextResponse.redirect(`${site}/account?upgraded=1`);
    res.cookies.set(PRO_COOKIE, encodeGuestPro({ sub: sub.id, cus: session.customer, exp }), proCookieOptions(req, exp));
    return res;
  } catch {
    return NextResponse.redirect(`${site}/pricing?payment=error`);
  }
}
