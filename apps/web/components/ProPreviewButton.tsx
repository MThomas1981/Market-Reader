'use client';

import { useState } from 'react';

/** Starts or ends the free Pro preview (only shown on copies where payments aren't set up). */
export function ProPreviewButton({ end = false }: { end?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pro-preview', { method: end ? 'DELETE' : 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Couldn’t change the preview.');
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <button type="button" className={`btn${end ? '' : ' btn-primary'}`} onClick={go} disabled={busy} style={{ justifyContent: 'center' }}>
        {busy ? 'One moment…' : end ? 'End the Pro preview' : 'Preview Pro (no payment)'}
      </button>
      {error && <span className="msg-error" role="alert" style={{ fontSize: 13 }}>{error}</span>}
    </div>
  );
}
