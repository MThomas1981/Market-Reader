import type { Metadata } from 'next';
import Link from 'next/link';
import { PLANS } from '@market-reader/core';
import { market } from '@/lib/market';
import { tradeHub } from '@/lib/realtime';

export const metadata: Metadata = { title: 'About this project' };
export const dynamic = 'force-dynamic';

const sources: [keyof ReturnType<typeof market.status>, string][] = [
  ['usQuotes', 'US stock quotes, profiles, news and earnings (Finnhub)'],
  ['usHistory', 'US stock and ETF price history (Massive, formerly Polygon.io)'],
  ['crypto', 'Crypto prices and history (CoinGecko)'],
  ['forex', 'Currency rates (Frankfurter, European Central Bank reference rates)'],
  ['longHistory', 'US stock 5-year and all-time charts (Tiingo; Massive covers about 2 years without it)'],
  ['cryptoLongHistory', 'Crypto 5-year and all-time charts (Kraken)'],
  ['international', 'International stocks'],
];

export default async function AboutPage() {
  const live = market.status();
  const health = await market.health();
  const hub = tradeHub();
  return (
    <article style={{ maxWidth: '72ch' }}>
      <div className="page-head"><h1>About this project</h1></div>

      <p className="surface" role="note" style={{ padding: '12px 16px' }}>
        <strong>Market Reader is a hypothetical application</strong> built as a class assignment for a senior-level college finance
        course. It is not a real company or a live service, it does not hold real money or place real trades (the portfolio is paper trading with simulated cash), and nothing in it is financial advice.
        Payments, where switched on, run only in Stripe&rsquo;s test mode.
      </p>

      <h2 className="section-title">What it does</h2>
      <ul>
        <li>Follows stocks, ETFs, market indexes, crypto and currencies with live quotes, charts, news and earnings.</li>
        <li>Keeps a watchlist and a paper-trading portfolio: $100,000 of simulated cash, buy and sell orders filled at the live price, and realized and unrealized P&amp;L with the average-cost method. No real money and no broker.</li>
        <li>An AI research assistant (Anthropic&rsquo;s Claude) answers questions using the same market data and cites each source it used.</li>
        <li>Price-range estimates from 1 day to 6 months, plus a risk and return analysis for each symbol.</li>
        <li>A free plan and a ${PLANS.pro.priceMonthlyUsd}/month Pro plan, to show how a subscription business would be set up.</li>
      </ul>

      <h2 className="section-title">Finance methods used</h2>
      <ul>
        <li><strong>CAGR rating (with every projection):</strong> compound annual growth rate, (end price ÷ start price)<sup>1/years</sup> − 1, over 1, 3, 5 and 10 years, graded on the 5-year rate (or 3 or 1 when that is all the history there is): A 15%+ a year, B 10–15%, C 5–10%, D 0–5%, F below 0%. It is compared with the S&amp;P 500 (SPY) over the same period, along with the share of past one-year periods that ended higher.</li>
        <li><strong>Price-range estimates:</strong> daily log returns over the past year feed a lognormal model. The expected trend blends the past year with the long-run CAGR (60% weight with 5+ years of history, 45% with 3, 25% with 1), then is shrunk by half toward zero, because past trend is a weak guide to future trend. The likely range is the 25th to 75th percentile and the wide range the 10th to 90th. A backtest reports how often past prices actually landed inside each range.</li>
        <li><strong>Risk and return:</strong> total return, annualised volatility, Sharpe and Sortino ratios, maximum drawdown, beta and correlation against the S&amp;P 500 (SPY), best and worst days.</li>
        <li><strong>Technical indicators:</strong> simple and exponential moving averages, RSI (14 day), MACD and Bollinger Bands.</li>
      </ul>
      <p className="muted">Estimates describe how much a price has tended to move. They are not predictions of what it will do.</p>

      <h2 className="section-title">Data on this copy</h2>
      <ul>
        {sources.map(([k, label]) => (
          <li key={k}>{label}: <strong>{live[k] === 'Demo data' ? 'demo data' : String(live[k]).includes('about 2 years') ? 'limited to about 2 years' : 'live'}</strong></li>
        ))}
      </ul>
      <h3 style={{ marginTop: 18 }}>Live check, run when this page loaded</h3>
      <div className="surface">
        <table className="qtable">
          <thead><tr><th scope="col">Source</th><th scope="col">Covers</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {health.map((h) => (
              <tr key={h.source}>
                <th scope="row">{h.source}</th>
                <td className="muted">{h.covers}</td>
                <td><strong className={h.ok ? 'up' : 'down'}>{h.ok ? 'Working' : 'Not working'}</strong> · {h.detail}{h.ok ? ` (${h.ms} ms)` : ''}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Real-time stream</th>
              <td className="muted">Every US stock trade, pushed to your screen</td>
              <td>
                {hub ? (
                  <><strong className={hub.lastError ? 'down' : 'up'}>{hub.lastError ? 'Problem' : 'Available'}</strong> · {hub.lastError ?? `connects when a US stock page or watchlist is open${hub.symbolCount ? `; now streaming ${hub.symbolCount} symbols` : ''}`}</>
                ) : (
                  <><strong className="down">Off</strong> · needs a Finnhub key</>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">
        If a data source is missing a key, rate-limited or offline, the app switches to made-up demo prices marked &ldquo;Demo data&rdquo; so
        it keeps working during a presentation. Free data tiers are for personal, non-commercial use.
      </p>

      <h2 className="section-title">How prices stay current</h2>
      <ul>
        <li><strong>US stocks and ETFs are real-time.</strong> The server keeps one WebSocket connection to Finnhub&rsquo;s trade feed and pushes every new trade to open pages within about a quarter of a second (Server-Sent Events). The quote page price, its chart, the watchlist and the paper portfolio all move on each trade.</li>
        <li>As a backstop the full quote is also re-fetched: every 5 seconds during US trading if streaming is unavailable, every 15 seconds for crypto, and once a minute when the market is closed. The watchlist refreshes every 10 seconds.</li>
        <li>A green pulsing dot means the price is live. When the market is closed the page says so and shows the last trade and when the market reopens, using Finnhub&rsquo;s market status with a built-in NYSE holiday and early-close calendar as backup.</li>
        <li>On the website, Vercel runs the app in its Washington, D.C. region (close to the US exchanges and data providers) and caches each price at its edge network for at most 5 seconds, so every visitor sees the same fresh number and the free data plans aren&rsquo;t used up.</li>
        <li>Made-up demo prices are never cached, so real prices come back as soon as a source recovers. Currency rates are the European Central Bank&rsquo;s daily reference rates and change once per business day.</li>
      </ul>

      <h2 className="section-title">Built with</h2>
      <p>Next.js (App Router), React, Tailwind CSS, Tiingo and Kraken (long price history), Supabase (accounts, row-level security, realtime sync), Stripe (test-mode subscriptions), Vercel (hosting and edge caching), Expo for the optional phone app, and TypeScript throughout.</p>

      <p><Link href="/pricing">See the plans</Link> · <Link href="/dashboard">Open the dashboard</Link></p>
    </article>
  );
}
