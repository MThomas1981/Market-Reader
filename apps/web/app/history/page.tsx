import type { Metadata } from 'next';
import { HistoryView } from '@/components/HistoryView';

export const metadata: Metadata = { title: 'Your stock history' };

export default function HistoryPage() {
  return (
    <>
      <div className="page-head"><h1>Your stock history</h1></div>
      <p className="muted" style={{ marginTop: -6, maxWidth: '62ch' }}>
        Every stock you&rsquo;ve looked at or saved, with the price when you first looked and how it has done since.
      </p>
      <HistoryView />
    </>
  );
}
