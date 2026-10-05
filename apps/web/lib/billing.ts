import 'server-only';
import Stripe from 'stripe';
import { supabaseAdmin } from './supabase/server';

/**
 * Stripe billing for the $20/month Pro plan. All payment code lives here and in app/api/stripe.
 * Set up in the Stripe dashboard: a product "Market Reader Pro" with a $20 monthly recurring price;
 * put its price id (price_...) in STRIPE_PRICE_PRO.
 */
/** Class project: only Stripe test keys are accepted, so no real card can ever be charged. */
export const isLiveKey = (key = process.env.STRIPE_SECRET_KEY ?? '') => /^(sk|rk)_live_/.test(key);
/** Only a Stripe test secret key is needed; the $20/month price is created on the fly when STRIPE_PRICE_PRO is blank. */
export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY && !isLiveKey());

/** The Pro line item: the dashboard price if one is set, otherwise $20/month defined inline. */
export function proLineItem(): Stripe.Checkout.SessionCreateParams.LineItem {
  if (process.env.STRIPE_PRICE_PRO) return { price: process.env.STRIPE_PRICE_PRO, quantity: 1 };
  return {
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: 2000,
      recurring: { interval: 'month' },
      product_data: { name: 'Market Reader Pro (student project, test mode)' },
    },
  };
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set.');
  if (isLiveKey()) throw new Error('This is a student project: use a Stripe test key (sk_test_...), not a live key.');
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function siteUrl(req: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
}

/** Find or create the Stripe customer for a user, remembering it in the subscriptions table. */
export async function customerFor(user: { id: string; email: string | null }): Promise<string> {
  const admin = supabaseAdmin();
  const { data } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id as string;
  const customer = await stripe().customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
  const { error } = await admin.from('subscriptions').insert({ user_id: user.id, stripe_customer_id: customer.id, status: 'none' });
  if (error) throw error;
  return customer.id;
}

/** Copy a Stripe subscription's state into Supabase. Works across Stripe API versions. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const raw = sub as unknown as {
    current_period_end?: number;
    items?: { data?: { current_period_end?: number; price?: { id?: string } }[] };
  };
  const periodEnd = raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end ?? null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const admin = supabaseAdmin();
  let userId: string | undefined = sub.metadata?.user_id;
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
    userId = data?.user_id as string | undefined;
  }
  if (!userId) throw new Error(`No Market Reader user for Stripe customer ${customerId}`);
  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: raw.items?.data?.[0]?.price?.id ?? null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}
