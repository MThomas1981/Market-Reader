import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/viewer';
import { BillingButton } from '@/components/BillingButton';
import { CancelProButton } from '@/components/CancelProButton';
import { authEnabled } from '@/lib/supabase/config';

export const metadata: Metadata = { title: 'Your account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const v = await getViewer();
  const { upgraded } = await searchParams;
  if (!v.user && v.guestPro) {
    const until = new Date(v.guestPro.exp * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return (
      <div style={{ maxWidth: 640 }}>
        <div className="page-head"><h1>Your plan</h1></div>
        {upgraded && <p className="surface empty" role="status">Payment confirmed with Stripe (test mode). Welcome to Pro: longer price-range estimates, deeper analysis and 100 AI questions a day are now on.</p>}
        <dl className="surface stats" style={{ marginBottom: 20 }}>
          <div><dt>Plan</dt><dd>Pro ($20 a month, Stripe test mode)</dd></div>
          <div><dt>Renews on</dt><dd>{until}</dd></div>
          <div><dt>Saved on</dt><dd>This browser</dd></div>
        </dl>
        <p className="muted" style={{ fontSize: 13, maxWidth: '62ch' }}>
          Accounts aren&rsquo;t set up on this copy, so Pro is kept on this browser. Market Reader checks the subscription with Stripe every few
          minutes, so cancelling ends Pro. No real money is charged in test mode.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'start' }}>
          <BillingButton action="portal" label="Manage billing" />
          <CancelProButton />
        </div>
      </div>
    );
  }
  if (!v.user || !v.db) redirect(authEnabled() ? '/auth/sign-in?next=/account' : '/pricing');
  const { data: sub } = await v.db.from('subscriptions').select('status, current_period_end, cancel_at_period_end').maybeSingle();
  const renews = sub?.current_period_end ? new Date(sub.current_period_end as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-head"><h1>Your account</h1></div>
      {upgraded && v.plan !== 'pro' && (
        <p className="surface empty" role="status">Payment received. Pro switches on within a minute; refresh this page if it hasn&rsquo;t yet.</p>
      )}
      {upgraded && v.plan === 'pro' && <p className="surface empty" role="status">Welcome to Pro.</p>}
      <dl className="surface stats" style={{ marginBottom: 20 }}>
        <div><dt>Email</dt><dd>{v.user.email}</dd></div>
        <div><dt>Plan</dt><dd>{v.limits.label}{v.plan === 'pro' ? ' ($20 a month)' : ''}</dd></div>
        {v.plan === 'pro' && renews && (
          <div><dt>{sub?.cancel_at_period_end ? 'Ends on' : 'Renews on'}</dt><dd>{renews}</dd></div>
        )}
        {sub?.status === 'past_due' && <div><dt>Payment</dt><dd className="down">Last payment failed. Update your card.</dd></div>}
      </dl>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'start' }}>
        {v.plan === 'pro' || sub ? (
          <BillingButton action="portal" label="Manage billing" />
        ) : null}
        {v.plan !== 'pro' && <Link href="/pricing" className="btn btn-primary">See Pro</Link>}
        <Link href="/history" className="btn">Your stock history</Link>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="btn">Sign out</button>
        </form>
      </div>
    </div>
  );
}
