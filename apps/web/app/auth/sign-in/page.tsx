import type { Metadata } from 'next';
import { SignInForm } from '@/components/SignInForm';
import { authEnabled } from '@/lib/supabase/config';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div style={{ maxWidth: 440, margin: '24px auto' }}>
      <div className="page-head"><h1>Sign in</h1></div>
      <p className="muted" style={{ marginTop: 0 }}>
        A free account syncs your watchlist between the web and your phone and remembers the stocks you look at.
      </p>
      {error && <p className="msg-error" role="alert">That sign-in link didn&rsquo;t work. It may have expired, so request a new one.</p>}
      {authEnabled() ? (
        <SignInForm next={next && next.startsWith('/') ? next : '/'} />
      ) : (
        <p className="surface empty">
          Accounts aren&rsquo;t set up yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
          <code> .env.local</code> and restart the app.
        </p>
      )}
    </div>
  );
}
