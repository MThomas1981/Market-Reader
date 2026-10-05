import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { billingEnabled, isLiveKey, customerFor, proLineItem, siteUrl, stripe } from '@/lib/billing';
import { authEnabled } from '@/lib/supabase/config';

/**
 * Start a Stripe Checkout for Pro ($20/month, test mode). Returns { url } to send the browser to.
 * With accounts on, Pro is tied to the signed-in user (via the webhook). With accounts off, Pro is
 * tied to this browser: Stripe sends it back to /api/stripe/confirm, which checks the payment.
 */
export async function POST(req: Request) {
  if (isLiveKey()) return NextResponse.json({ error: 'This class project only runs Stripe in test mode. Swap the live key for a test key (sk_test_...).' }, { status: 503 });
  if (!billingEnabled()) return NextResponse.json({ error: 'Payments are off on this copy: add a Stripe test secret key (STRIPE_SECRET_KEY=sk_test_...) to apps/web/.env.local.' }, { status: 503 });
  const v = await getViewer(req);
  if (v.plan === 'pro') return NextResponse.json({ error: 'You’re already on Pro.' }, { status: 409 });
  const site = siteUrl(req);
  try {
    if (authEnabled()) {
      if (!v.user) return NextResponse.json({ error: 'Sign in first, then upgrade.' }, { status: 401 });
      const session = await stripe().checkout.sessions.create({
        mode: 'subscription',
        customer: await customerFor(v.user),
        client_reference_id: v.user.id,
        line_items: [proLineItem()],
        subscription_data: { metadata: { user_id: v.user.id } },
        allow_promotion_codes: true,
        success_url: `${site}/account?upgraded=1`,
        cancel_url: `${site}/pricing`,
      });
      return NextResponse.json({ url: session.url });
    }
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [proLineItem()],
      subscription_data: { metadata: { market_reader: 'guest-pro' } },
      success_url: `${site}/api/stripe/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/pricing?canceled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: `Stripe: ${(err as Error).message}` }, { status: 502 });
  }
}
