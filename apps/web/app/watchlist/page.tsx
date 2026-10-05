import type { Metadata } from 'next';
import { WatchlistView } from '@/components/WatchlistView';

export const metadata: Metadata = { title: 'Watchlist' };

export default function WatchlistPage() {
  return (
    <>
      <div className="page-head">
        <h1>Your watchlist</h1>
      </div>
      <WatchlistView />
    </>
  );
}
