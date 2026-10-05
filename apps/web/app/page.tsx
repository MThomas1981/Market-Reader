import { INDEX_PROXIES, US_STOCKS, direction, formatPercent, formatPrice, timeAgo, type MarketOverview, type NewsItem } from '@market-reader/core';
import Link from 'next/link';
import { market } from '@/lib/market';
import { NewsList } from '@/components/NewsList';
import { QuoteTable, SourceTag, quoteHref } from '@/components/bits';

export const dynamic = 'force-dynamic';

export default async function MarketsPage() {
  const [overview, news] = await Promise.all([
    market.overview().catch(() => null as MarketOverview | null),
    market.news(undefined, 12).catch(() => [] as NewsItem[]),
  ]);
  const status = market.status();
  const instruments = new Map(
    [...(overview?.indexes ?? []), ...(overview?.gainers ?? []), ...(overview?.losers ?? []), ...(overview?.crypto ?? []), ...(overview?.forex ?? [])]
      .map((q) => [q.symbol, market.instrument(q.symbol)]),
  );
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <div className="page-head">
        <h1>Markets on {today}</h1>
        {overview && <span className="asof">Updated {timeAgo(overview.updatedAt)}. <SourceTag source={overview.indexes[0]?.source ?? status.usQuotes} /></span>}
      </div>

      {!overview ? (
        <p className="surface empty">Market data didn&rsquo;t load. Check your API keys in .env, or set MARKET_READER_DEMO=true to run on demo data.</p>
      ) : (
        <>
          <section className="surface index-strip" aria-label="Major indexes">
            {overview.indexes.map((q) => {
              const proxy = INDEX_PROXIES.find((i) => i.symbol === q.symbol);
              return (
                <Link key={q.symbol} href={quoteHref(q.symbol)} className="index-cell">
                  <span className="name">{proxy?.name ?? q.symbol}</span>
                  <span className="via">Tracked by {q.symbol}</span>
                  <span className="price">{formatPrice(q.price, q.currency)}</span>
                  <span className={`chg ${direction(q.changePercent)}`}>{formatPercent(q.changePercent)}</span>
                </Link>
              );
            })}
          </section>

          <div className="home-grid">
            <div>
              <div className="pair">
                <QuoteTable title="Biggest gainers" quotes={overview.gainers} instruments={instruments} />
                <QuoteTable title="Biggest losers" quotes={overview.losers} instruments={instruments} />
              </div>
              <div className="pair">
                <QuoteTable title="Crypto" quotes={overview.crypto} instruments={instruments} foot={<>24-hour change. <SourceTag source={overview.crypto[0]?.source ?? status.crypto} /></>} />
                <QuoteTable title="Currencies" priceLabel="Rate" quotes={overview.forex} instruments={instruments} foot={<>Daily reference rates. <SourceTag source={overview.forex[0]?.source ?? status.forex} delayed /></>} />
              </div>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Gainers and losers are drawn from {US_STOCKS.length} large US companies. Free data plans don&rsquo;t include whole-market scans.
              </p>
            </div>
            <div>
              <h2 className="section-title">Market news</h2>
              <NewsList items={news} configured={status.news !== 'Not configured'} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
