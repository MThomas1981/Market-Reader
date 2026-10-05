'use client';

import { useEffect } from 'react';

/** Adds this symbol to a signed-in user's stock history. Guests are ignored by the server. */
export function RecordView({ symbol }: { symbol: string }) {
  useEffect(() => {
    fetch('/api/me/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) }).catch(() => {});
  }, [symbol]);
  return null;
}
