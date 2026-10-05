import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, syncSubscription } from '@/lib/billing';

/**
 * Stripe → Supabase. In the Stripe dashboard, add an endpoint at https://<your site>/api/stripe/webhook
 * listening for: checkout.session.completed, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted. Put its signing secret in STRIPE_WEBHOOK_SECRET.
 * Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');
  if (!secret || !signature) return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    return NextResponse.json({ error: `Signature check failed: ${(err as Error).message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          // Re-read from Stripe so we store the current state, not the event's snapshot.
          await syncSubscription(await stripe().subscriptions.retrieve(id));
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(await stripe().subscriptions.retrieve(sub.id).catch(() => sub));
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry later.
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
