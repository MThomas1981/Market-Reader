import { timeAgo, type NewsItem } from '@market-reader/core';

export function NewsList({ items, title = 'News', configured }: { items: NewsItem[]; title?: string; configured: boolean }) {
  return (
    <section className="surface" aria-label={title}>
      {items.length > 0 ? (
        <ul className="news">
          {items.map((n) => (
            <li key={n.id}>
              <a className="headline" href={n.url} target="_blank" rel="noopener noreferrer">{n.headline}</a>
              <div className="meta">{n.source}, {timeAgo(n.publishedAt)}</div>
            </li>
          ))}
        </ul>
      ) : configured ? (
        <p className="empty">No recent headlines.</p>
      ) : (
        <p className="empty">
          To see news here, add a free <code>FINNHUB_API_KEY</code> to your <code>.env</code> file and restart the app.
        </p>
      )}
    </section>
  );
}
