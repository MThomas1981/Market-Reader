'use client';

import { useEffect, useState } from 'react';
import { onWatchlistChange, readWatchlist, syncWatchlist, writeWatchlist } from '@/lib/watchlist';

export function WatchButton({ symbol }: { symbol: string }) {
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWatching(readWatchlist().includes(symbol));
    syncWatchlist();
    return onWatchlistChange((list) => { setWatching(list.includes(symbol)); setError(null); }, setError);
  }, [symbol]);

  const toggle = () => {
    const list = readWatchlist();
    writeWatchlist(list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol]);
  };

  return (
    <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
    <button type="button" className="btn" aria-pressed={watching} onClick={toggle}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={watching ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
      </svg>
      {watching ? 'On your watchlist' : 'Add to watchlist'}
    </button>
    {error && <span className="msg-error" role="alert" style={{ fontSize: 13, maxWidth: 260, textAlign: 'right' }}>{error} <a href="/pricing" style={{ color: 'var(--accent)' }}>See plans</a></span>}
    </div>
  );
}
