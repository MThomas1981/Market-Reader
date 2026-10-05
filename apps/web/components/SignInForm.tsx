'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const sendLink = async () => {
    setError(null);
    setState('sending');
    const { error: err } = await supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    if (err) {
      setError(err.message);
      setState('idle');
    } else setState('sent');
  };

  const google = async () => {
    setError(null);
    const { error: err } = await supabaseBrowser().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (err) setError(err.message);
  };

  if (state === 'sent') {
    return (
      <div className="surface" style={{ padding: 20 }}>
        <p style={{ margin: 0 }}>Check <strong>{email}</strong> for a sign-in link. You can close this tab once you&rsquo;ve clicked it.</p>
      </div>
    );
  }

  return (
    <div className="surface" style={{ padding: 20, display: 'grid', gap: 12 }}>
      <form onSubmit={(e) => { e.preventDefault(); sendLink(); }} style={{ display: 'grid', gap: 10 }}>
        <label htmlFor="email" style={{ fontWeight: 500 }}>Email</label>
        <input
          id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ height: 42, padding: '0 12px', border: '1px solid var(--rule)', borderRadius: 8, font: 'inherit', background: 'var(--paper)', color: 'var(--ink)' }}
        />
        <button type="submit" className="btn btn-primary" disabled={state === 'sending'} style={{ justifyContent: 'center' }}>
          {state === 'sending' ? 'Sending link…' : 'Email me a sign-in link'}
        </button>
      </form>
      <div className="muted" style={{ textAlign: 'center', fontSize: 13 }}>or</div>
      <button type="button" className="btn" onClick={google} style={{ justifyContent: 'center' }}>Continue with Google</button>
      {error && <p className="msg-error" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
