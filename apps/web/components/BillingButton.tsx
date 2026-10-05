'use client';

import { useState } from 'react';

/** Sends the user to Stripe Checkout (upgrade) or the Stripe billing portal (manage). */
export function BillingButton({ action, label, primary = false }: { action: 'checkout' | 'portal'; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stripe/${action}`, { method: 'POST' });
      const body = await res.json();
      if (res.status === 401) {
        window.location.href = `/auth/sign-in?next=${encodeURIComponent('/pricing')}`;
        return;
      }
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Couldn’t open billing.');
      window.location.href = body.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <button type="button" className={`btn${primary ? ' btn-primary' : ''}`} onClick={go} disabled={busy} style={{ justifyContent: 'center' }}>
        {busy ? 'Opening Stripe…' : label}
      </button>
      {error && <span className="msg-error" role="alert" style={{ fontSize: 13 }}>{error}</span>}
    </div>
  );
}
