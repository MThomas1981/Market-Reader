import type { Metadata } from 'next';
import {
  formatCompact, formatNumber, formatPercent, formatPrice, normalizeSymbol,
  type EarningsResult, type NewsItem, type Profile, type Quote,
} from '@market-reader/core';
import { market } from '@/lib/market';
import { PriceChart } from '@/components/PriceChart';
import { WatchButton } from '@/components/WatchButton';
import { AiBrief } from '@/components/AiBrief';
import { NewsList } from '@/components/NewsList';
import { LiveQuote } from '@/components/LiveQuote';
import { ForecastPanel } from '@/components/ForecastPanel';
import { AnalysisPanel } from '@/components/AnalysisPanel';
import { RecordView } from '@/components/RecordView';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ symbol: string }> };

const KIND: Record<string, string> = { stock: 'Stock', etf: 'ETF', crypto: 'Cryptocurrency', forex: 'Currency pair', index: 'Index' };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const symbol = normalizeSymbol((await params).symbol);
  const inst = market.instrument(symbol);
  return { title: `${inst.name === symbol ? symbol : `${inst.name} (${symbol})`}` };
}

export default async function QuotePage({ params }: Params) {
  const symbol = normalizeSymbol((await params).symbol);
  const inst = market.instrument(symbol);
  const fx = inst.assetClass === 'forex';
  const [quote, profile, earnings, news] = await Promise.all([
    market.quote(symbol).catch((e: Error) => e),
    market.profile(symbol).catch(() => null as Profile | null),
    market.earnings(symbol).catch(() => [] as EarningsResult[]),
    market.news(symbol, 8).catch(() => [] as NewsItem[]),
  ]);
  const status = market.status();
  const name = profile?.name || inst.name;
  const s = profile?.stats;

  if (quote instanceof Error) {
    return (
      <div className="surface empty">
        <h1 className="quote-name" style={{ marginBottom: 8 }}>{symbol}</h1>
        <p>We couldn&rsquo;t find a price for {symbol}. Check the symbol, or try searching by company name. ({quote.message})</p>
      </div>
    );
  }
  const q = quote as Quote;
  const stats: [string, string][] = [
    ['Previous close', formatPrice(q.previousClose, q.currency, { forex: fx })],
    ['Open', formatPrice(q.open, q.currency, { forex: fx })],
    ['Day range', q.low !== null && q.high !== null ? `${formatPrice(q.low, q.currency, { forex: fx })} – ${formatPrice(q.high, q.currency, { forex: fx })}` : '—'],
    ['52-week range', s?.week52Low != null && s?.week52High != null ? `${formatPrice(s.week52Low, q.currency, { forex: fx })} – ${formatPrice(s.week52High, q.currency, { forex: fx })}` : '—'],
  ];
  if (!fx) {
    stats.push(
      ['Market cap', s?.marketCap ? `${formatCompact(s.marketCap)} ${q.currency}` : '—'],
      [inst.assetClass === 'crypto' ? '24h volume' : 'Avg. volume (10 day)', formatCompact(s?.avgVolume)],
    );
  }
  if (inst.assetClass === 'stock' || inst.assetClass === 'etf') {
    stats.push(
      ['P/E ratio', s?.peRatio != null ? formatNumber(s.peRatio, 2) : '—'],
      ['Dividend yield', s?.dividendYield != null ? formatPercent(s.dividendYield, false) : '—'],
      ['Beta', s?.beta != null ? formatNumber(s.beta, 2) : '—'],
      ['Exchange', profile?.exchange || inst.exchange],
    );
  }

  return (
    <>
      <div className="quote-head">
        <div>
          <div className="quote-kicker">{KIND[inst.assetClass]} on {inst.exchange}{inst.country !== 'US' && inst.country !== 'Global' ? `, ${inst.country}` : ''}</div>
          <h1 className="quote-name">{name} <span className="muted" style={{ fontWeight: 400 }}>{symbol}</span></h1>
        </div>
        <WatchButton symbol={symbol} />
      </div>

      <LiveQuote
        symbol={symbol}
        initial={q}
        assetClass={inst.assetClass}
        usListed={inst.country === 'US' && inst.assetClass !== 'crypto' && inst.assetClass !== 'forex'}
      />

      <RecordView symbol={symbol} />
      <AiBrief symbol={symbol} />

      <div className="quote-grid">
        <div>
          <PriceChart symbol={symbol} assetClass={inst.assetClass} currency={q.currency} />
          <ForecastPanel symbol={symbol} currency={q.currency} forex={fx} />
          <AnalysisPanel symbol={symbol} />

          {earnings.length > 0 && (
            <section className="stack-section" style={{ marginTop: 28 }}>
              <h2 className="section-title">Earnings per share</h2>
              <div className="surface">
                <table className="qtable">
                  <thead>
                    <tr><th scope="col">Quarter ending</th><th scope="col" className="num">Actual</th><th scope="col" className="num">Estimate</th><th scope="col" className="num">Surprise</th></tr>
                  </thead>
                  <tbody>
                    {earnings.slice(0, 4).map((e) => (
                      <tr key={e.period}>
                        <td>{new Date(e.period).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
                        <td className="num">{formatNumber(e.actual, 2)}</td>
                        <td className="num">{formatNumber(e.estimate, 2)}</td>
                        <td className={`num ${(e.surprisePercent ?? 0) >= 0 ? 'up' : 'down'}`}>{formatPercent(e.surprisePercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(profile?.description || profile?.industry || profile?.website) && (
            <section className="stack-section" style={{ marginTop: 28 }}>
              <h2 className="section-title">About</h2>
              <div className="surface about">
                {profile.description && <p>{profile.description}</p>}
                {profile.industry && <div className="muted">Industry: {profile.industry}</div>}
                {profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>}
              </div>
            </section>
          )}
        </div>

        <div>
          <h2 className="section-title">Key numbers</h2>
          <dl className="surface stats" style={{ marginBottom: 28 }}>
            {stats.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <h2 className="section-title">News about {symbol}</h2>
          <NewsList items={news} configured={status.news !== 'Not configured'} />
        </div>
      </div>
    </>
  );
}
