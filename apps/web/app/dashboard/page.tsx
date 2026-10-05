import type { Metadata } from 'next';
import Link from 'next/link';
import { getViewer } from '@/lib/viewer';
import { authEnabled } from '@/lib/supabase/config';
import { LiveWatchlist } from '@/components/dashboard/LiveWatchlist';
import { PortfolioPanel } from '@/components/dashboard/PortfolioPanel';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const v = await getViewer();
  const userId = v.user?.id ?? null;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-[32px] font-semibold tracking-tight">Your dashboard</h1>
        {v.user ? (
          <span className="text-sm text-muted">
            Signed in as {v.user.email}. {v.plan === 'pro' ? 'Pro plan.' : <>Free plan. <Link href="/pricing" className="text-accent">See Pro</Link></>}
          </span>
        ) : (
          <span className="text-sm text-muted">
            {authEnabled() ? (
              <><Link href="/auth/sign-in?next=/dashboard" className="text-accent">Sign in</Link> to keep this in sync between your devices.</>
            ) : (
              'Saved in this browser. Add the Supabase keys to sync across devices.'
            )}
          </span>
        )}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PortfolioPanel userId={userId} />
        <LiveWatchlist userId={userId} limit={v.limits.watchlistSymbols} />
      </div>
    </>
  );
}
