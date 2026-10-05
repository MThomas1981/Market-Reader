import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEMO_SOURCE, direction, formatPercent, formatPrice, symbolToPath, type Instrument, type Quote } from '@market-reader/core';

export function SourceTag({ source, delayed }: { source: string; delayed?: boolean }) {
  const demo = source === DEMO_SOURCE;
  return (
    <span className={`source-tag${demo ? ' demo' : ''}`} title={demo ? 'Made-up prices for development. Add API keys to see real data.' : undefined}>
      <span className="dot" aria-hidden />
      {demo ? 'Demo data, not real prices' : `${source}${delayed ? ', delayed' : ''}`}
    </span>
  );
}

export function ChangePill({ pct }: { pct: number }) {
  return <span className={`pill ${direction(pct)}`}>{formatPercent(pct)}</span>;
}

export const quoteHref = (symbol: string) => `/quote/${symbolToPath(symbol)}`;

export function QuoteTable({
  title, quotes, instruments, foot, priceLabel = 'Price',
}: {
  title: string;
  quotes: Quote[];
  instruments: Map<string, Instrument>;
  foot?: ReactNode;
  priceLabel?: string;
}) {
  return (
    <section className="surface" aria-label={title}>
      <table className="qtable">
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col" className="num">{priceLabel}</th>
            <th scope="col" className="num">Today</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const inst = instruments.get(q.symbol);
            const fx = inst?.assetClass === 'forex';
            return (
              <tr key={q.symbol}>
                <td>
                  <Link href={quoteHref(q.symbol)}>
                    <span className="sym">{q.symbol}</span>
                    <span className="nm">{inst?.name ?? ''}</span>
                  </Link>
                </td>
                <td className="num">{formatPrice(q.price, q.currency, { forex: fx })}</td>
                <td className="num"><ChangePill pct={q.changePercent} /></td>
              </tr>
            );
          })}
          {quotes.length === 0 && (
            <tr><td colSpan={3} className="muted">Nothing to show right now.</td></tr>
          )}
        </tbody>
      </table>
      {foot && <div className="table-foot">{foot}</div>}
    </section>
  );
}
