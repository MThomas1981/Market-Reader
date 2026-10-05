import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="surface empty">
      <h1 className="quote-name" style={{ marginBottom: 8 }}>Page not found</h1>
      <p>Search for a stock, fund, coin or currency above, or <Link href="/" style={{ color: 'var(--accent)' }}>go back to Markets</Link>.</p>
    </div>
  );
}
