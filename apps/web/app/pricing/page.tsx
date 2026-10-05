import type { Metadata } from 'next';
import Link from 'next/link';
import { PLAN_FEATURES, PLANS } from '@market-reader/core';
import { getViewer } from '@/lib/viewer';
import { BillingButton } from '@/components/BillingButton';
import { billingEnabled } from '@/lib/billing';
import { authEnabled } from '@/lib/supabase/config';

export const metadata: Metadata = { title: 'Plans' };
export const dynamic = 'force-dynamic';

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ canceled?: string; ended?: string; payment?: string }> }) {
  const v = await getViewer();
  const sp = await searchParams;
  return (
    <>
      <div className="page-head"><h1>Plans</h1></div>
      <p className="muted" style={{ marginTop: -6, maxWidth: '62ch' }}>
        Everything you need to follow the markets is free. Pro adds longer price-range estimates, deeper analysis and a permanent record of every stock you&rsquo;ve looked at.
      </p>

      <p className="surface" role="note" style={{ padding: '12px 16px', margin: '16px 0', maxWidth: '72ch' }}>
        <strong>Test mode, no real charges.</strong> This is a class project, so checkout uses Stripe&rsquo;s test mode. To try the Pro
        upgrade, pay with the test card <strong>4242 4242 4242 4242</strong>, any future expiry date, any 3-digit CVC and any postcode.
        {!billingEnabled() && ' Payments are switched off on this copy because no Stripe test key is set, so the upgrade button explains that instead.'}
      </p>
      {sp.canceled && <p className="surface empty" role="status">Checkout was cancelled. Nothing was charged.</p>}
      {sp.ended && <p className="surface empty" role="status">Pro has ended and the test subscription is cancelled.</p>}
      {sp.payment && <p className="surface empty" role="alert">Stripe didn&rsquo;t confirm the payment, so Pro wasn&rsquo;t switched on. Try again with the test card.</p>}

      <div className="plans">
        <section className="surface plan">
          <h2>Free</h2>
          <div className="plan-price">$0</div>
          <p className="muted">Sign in to sync your watchlist and keep your last 10 stocks.</p>
          {v.user || v.plan === 'pro' || !authEnabled() ? (
            <span className="plan-current">{v.plan === 'pro' ? 'Included' : 'Your current plan'}</span>
          ) : (
            <Link className="btn" href="/auth/sign-in?next=/pricing" style={{ justifyContent: 'center' }}>Create a free account</Link>
          )}
        </section>
        <section className="surface plan plan-pro">
          <h2>Pro</h2>
          <div className="plan-price">${PLANS.pro.priceMonthlyUsd}<span> a month</span></div>
          <p className="muted">Cancel any time from your account page. Billing by Stripe.</p>
          {v.plan === 'pro' ? (
            <Link className="plan-current" href="/account">Your current plan · manage</Link>
          ) : (
            <BillingButton action="checkout" label="Upgrade to Pro" primary />
          )}
        </section>
      </div>

      <section className="surface" style={{ marginTop: 24 }}>
        <table className="qtable">
          <thead>
            <tr><th scope="col">What you get</th><th scope="col">Free</th><th scope="col">Pro</th></tr>
          </thead>
          <tbody>
            {PLAN_FEATURES.map((f) => (
              <tr key={f.feature}><td>{f.feature}</td><td>{f.free}</td><td><strong>{f.pro}</strong></td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="muted" style={{ fontSize: 13 }}>
        Price-range estimates are statistical ranges based on past price movement. They are not predictions of what will happen and not financial advice.
      </p>
    </>
  );
}
