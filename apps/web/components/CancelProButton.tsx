'use client';

import { useState } from 'react';

/** Ends Pro bought without an account (cancels the Stripe test subscription). */
export function CancelProButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Couldn’t cancel.');
      window.location.href = '/pricing?ended=1';
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {confirming ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, end Pro now'}</button>
          <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>Keep Pro</button>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setConfirming(true)}>Cancel Pro</button>
      )}
      {error && <span className="msg-error" role="alert" style={{ fontSize: 13 }}>{error}</span>}
    </div>
  );
}
