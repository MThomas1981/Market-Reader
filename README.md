# Market Reader

> **Class project.** Market Reader is a hypothetical application built for a senior-level college finance course. It is not a real company or a live service, it is not intended for public release, it never places real trades or holds real money (the portfolio is paper trading with simulated cash), and nothing in it is financial advice. Payments run in Stripe test mode only; the app refuses live Stripe keys.

Research stocks, ETFs, crypto and currencies on the web and on your phone, with charts, news and an AI assistant that cites its sources. Research, tracking and paper trading with simulated money: no real trading.

## For graders: run it in two minutes

1. Install [Node.js](https://nodejs.org) 20 or newer (the LTS download).
2. Open a terminal in this folder and run `npm install` then `npm run dev` (any system). On Windows you can instead right-click `Setup Market Reader Shortcut.ps1` > Run with PowerShell once, then use the **Market Reader** desktop shortcut, which runs the app with no terminal window.
3. Open http://localhost:3000/dashboard (the desktop shortcut opens it for you). The first start takes a minute or two while packages install.

**No API keys are needed.** Without keys, or whenever a live data source is down or rate-limited, every screen falls back to made-up prices clearly marked "Demo data", so the app always runs. Crypto and currency prices are live even without keys. Accounts (Supabase), the AI assistant (Anthropic) and the Pro upgrade (Stripe test mode) switch on only when their keys are added; see the sections below.

Suggested tour: Markets home → search "AAPL" → the quote page's chart, price-range estimates and analysis → Dashboard (add a watchlist symbol; place a paper buy, sell part of it and watch cash, holdings and realized P&L update; try selling more shares than you hold to see the "Insufficient shares to sell" message) → Plans → **About this project** (linked in the footer), which summarises the finance methods and shows which data sources are live on your copy.

Paper trades fill at the live price. On a copy with no stock-data key they fill at the demo price and the confirmation says so.

**Automated checks:** `npm test` runs the core tests (data layer, chart windows, indicators, estimates, portfolio and paper-trading maths). `supabase/tests/paper_trading_test.sql` checks the database side: per-user isolation, the atomic buy and sell functions and their error messages (see "Paper trading in the database" below).

## What works

| Area | Web | Mobile |
| --- | --- | --- |
| Markets home: index trackers, gainers and losers, crypto, currencies, news | Yes | Yes |
| Search across stocks, ETFs, crypto, currencies and international listings | Yes | Yes |
| Quote pages: price, key numbers, earnings, about, news | Yes | Yes |
| Charts: 1D to Max, line and candles, SMA 20/50/200, Bollinger, RSI, MACD, volume | Yes | Line chart, all ranges |
| Price-range estimates, 1 day to 6 months, with a track record | Yes | Yes |
| Deeper analysis: return, volatility, deepest drop, beta vs. S&P 500 (Pro) | Yes | Yes |
| Dashboard: live watchlist and paper-trading portfolio (simulated cash, buy and sell orders, realized P&L), synced in real time | Yes | Watchlist |
| Accounts (email link or code, Google on web), watchlist synced between web and phone | Yes | Yes |
| Stock history: everything you looked at, with performance since | Yes | Yes |
| Free and $20/month Pro plans, paid through Stripe | Yes | Opens the web to upgrade |
| AI assistant with cited answers, and a "Today, in brief" summary on each quote | Yes | Yes |
| Price alerts | Milestone 7 | Milestone 7 |

## Plans

| | Free | Pro, $20 a month |
| --- | --- | --- |
| Quotes, charts, indicators, news | Yes | Yes |
| Price-range estimates | 1 day and 1 week | 1 day to 6 months, with track record |
| Deeper analysis | No | Yes |
| Stock history | Last 10 | Everything, kept for good |
| Synced watchlist | 10 symbols | 500 symbols |
| AI questions per day | 5 (guests 3) | 100, plus web search |

Limits live in `packages/core/src/plans.ts`. The server enforces them, so changing that file changes the product.

### How the estimates work

**CAGR rating on every projection.** Each price projection (web, phone app and AI assistant) comes with a CAGR rating: compound annual growth over 1, 3, 5 and 10 years, graded on the 5-year rate (A 15%+ a year, B 10–15%, C 5–10%, D 0–5%, F below 0%), compared with the S&P 500 and with how often one-year periods ended higher. The long-run CAGR also anchors the projection's trend (60% weight with 5+ years of history). Code: `packages/core/src/cagr.ts`, `apps/web/lib/projection.ts`. US stocks need the Tiingo key for 5- and 10-year CAGR; without it the rating uses the ~2 years Massive provides and says so.

`packages/core/src/forecast.ts` fits a lognormal random-walk model to the past year of daily returns. Volatility sets how wide the ranges are, and the past trend is shrunk halfway toward zero. Each horizon gets a likely range (50% chance) and a wide range (80% chance). Pro also gets a backtest: the same method is replayed over the past year, and the app shows how often the real price landed inside the wide range (about 80% means well calibrated). These are statistical ranges, not predictions, and the app says so wherever they appear.

Without any API keys the app runs on **demo data**: made-up prices, marked in red as "Demo data, not real prices" everywhere they appear.

## Put it online (one link)

Market Reader is a website, so the easiest way to share it is a web address, for example `https://market-reader-yourname.vercel.app`. Nothing to download or install; it works on any computer or phone. Vercel's free Hobby plan is for non-commercial projects, which fits a class assignment.

**Quick way (Windows):** double-click `Publish Website.cmd` and follow the prompts in its window:

1. Log in to Vercel in the browser page it opens (or create a free account).
2. Answer the setup questions: **Set up and deploy?** Y · **Link to existing project?** N · **Project name:** `market-reader` · **In which directory is your code located?** type `./apps/web` · **Modify settings?** N.
3. It copies your market-data keys (Finnhub, Massive, CoinGecko) from `apps/web/.env.local` to Vercel, then publishes. The web address is printed at the end and copied to your clipboard.

**Other way (any computer):** push this folder to GitHub, then in Vercel choose Add New > Project, import the repository, set **Root Directory** to `apps/web`, add the keys from `.env.example` under Environment Variables, and deploy.

How the website keeps prices accurate:
- **Real-time trades (WebSocket):** `apps/web/lib/realtime.ts` keeps one WebSocket connection from the server to Finnhub's trade feed (`wss://ws.finnhub.io`) and `app/api/stream` pushes each new US stock or ETF trade to open pages as Server-Sent Events, at most 4 updates a second per page. The quote price, the chart's last point, the watchlist and the portfolio all move on every trade. The API key never reaches the browser, and every viewer shares the one upstream connection (Finnhub's free plan allows 50 symbols per connection). On Vercel each stream lasts up to 60 seconds and the browser reconnects on its own. Use one running copy per Finnhub key: a second copy with the same key (for example your laptop and Vercel at once) can knock the first off the feed.
- **Diagnosing prices:** the About page (and `/api/status?check=1`) asks every source for a real price on the spot and shows "Working" or the exact problem, such as an invalid key or a hit rate limit. Prices that fell back to demo data are marked "Demo" in the watchlist.
- **Ticker symbols:** US share classes with a dot (BRK.B, BF.B) are priced from the US feed; only real foreign exchange suffixes (.TO, .L, .DE, .T, …) are treated as international listings. Charts use split-adjusted history.
- **Live refresh (backstop):** quote pages fetch a full quote every 5 seconds when streaming isn't available during US trading (pre-market, regular and after hours), every 15 seconds for crypto and every minute when the market is closed; the watchlist every 10 seconds, and immediately when you return to the tab.
- **Market status:** a pulsing green dot means live. When the market is shut, the page says so, shows the last trade time and when trading resumes (Finnhub market status, with a built-in NYSE holiday and early-close calendar in `packages/core/src/market-hours.ts`).
- **Vercel:** `apps/web/vercel.json` runs the app in Vercel's `iad1` region (Washington, D.C., near the exchanges and data providers). Price responses are cached on Vercel's edge network for at most 5 seconds and never served staler than that, so all visitors share one fresh copy and the free data plans' request limits hold up. Demo-data fallbacks are never cached.

Notes:
- Without keys the site still works: crypto and currencies are live and US stocks show "Demo data".
- The AI assistant's key (`ANTHROPIC_API_KEY`) is not copied automatically, because on a public link every visitor's question is billed to your Anthropic account. Add it in Vercel (Settings > Environment Variables) if you want the assistant live for your presentation, and remove it afterwards.
- Accounts and the Pro upgrade switch on when the Supabase and Stripe test keys are added the same way.

## Run the web app

**On Windows, the quick way:** right-click `Setup Market Reader Shortcut.ps1` in this folder and choose Run with PowerShell (once). It lists and removes the old launcher files, writes the windowless launcher `Market Reader.js`, and puts a **Market Reader** shortcut on your desktop with the app icon. Clicking the shortcut starts the app with no command window (installing packages the first time) and opens the dashboard in your browser. The app keeps running in the background; use Start menu > Market Reader > **Stop Market Reader** to stop it. Its output goes to `%LOCALAPPDATA%\Market Reader\server.log`. Run the script with `-ListOnly` to see what it would change without changing anything.

You need [Node.js](https://nodejs.org) 20 or newer (the LTS download).

Open a terminal in this folder and run:

```
npm install
npm run dev
```

Then open http://localhost:3000.

### Add your API keys (optional, free)

1. Copy `.env.example` to `apps/web/.env.local`
   (Windows: `copy .env.example apps\web\.env.local`, Mac/Linux: `cp .env.example apps/web/.env.local`).
2. Paste in the keys you have:
   - `FINNHUB_API_KEY`: US quotes, company profiles, news, earnings. Free at https://finnhub.io/register
   - `MASSIVE_API_KEY`: US stock and ETF chart history up to 1 year. Free at https://massive.com
   - `TIINGO_API_KEY`: the 5Y and MAX charts for US stocks and ETFs, back to 1962 and adjusted for splits and dividends. Free at https://www.tiingo.com (without it, those charts show Massive's ~2 years and say so)
   - `ANTHROPIC_API_KEY`: the AI assistant. From https://console.anthropic.com (usage is billed by Anthropic)
   - Crypto (CoinGecko) and currencies (Frankfurter) work without a key.
3. Restart `npm run dev`. Visit http://localhost:3000/api/status to see which sources are live.

## Charts and moving averages

The quote page chart (`apps/web/components/PriceChart.tsx`, drawn with TradingView's Lightweight Charts) picks the bar size from the range:

| Range | Bars | Range | Bars |
| --- | --- | --- | --- |
| 1D | 5-minute | 1Y | daily |
| 5D | 15-minute | 5Y | daily (crypto weekly) |
| 1M | 1-hour | MAX | weekly |
| 6M, YTD | daily | Currencies | daily only (ECB rates) |

**Moving averages:** quick toggles for SMA 20, SMA 50, SMA 200, EMA 20 and EMA 50 (SMA solid, EMA dashed, each its own color), and a **Moving averages** menu to switch lines on or off, change SMA/EMA, set any period from 2 to 500, pick a color, or add lines (up to 8). Settings are remembered in the browser. A legend on the chart shows each line's value under the cursor.

**No warm-up gap:** a 200-period average normally can't start until the 200th bar. The chart asks the server for that many extra bars before the visible range (`/api/history/AAPL?range=1Y&lookback=200`), calculates every indicator over the full series, then shows only the requested range, so each line starts at the left edge. EMAs get twice their period, so the starting estimate has settled. If a data source simply has no earlier history (a recent listing, or a free plan's limit), the chart says when the line starts instead.

How it's built:
- `packages/core/src/chart-window.ts`: range → bar size, how far back to fetch for N bars of lookback (accounting for weekends, holidays and trading hours), and where the visible part starts (1D/5D keep whole New York sessions, including pre-market and after-hours).
- `packages/core/src/indicators.ts`: `sma` (rolling mean) and `ema` (seeded with the SMA, then smoothed by 2/(n+1)); `packages/core/src/ma.ts`: line settings, colors and lookback needs.
- `apps/web/lib/useHistory.ts`: fetches and caches per range; a bigger buffer already loaded serves smaller needs, and the old chart stays up while more history loads.
- One fetched series per range is shared by all lookback sizes up to 200 bars, which keeps Massive's free plan (5 requests a minute) from running out. If a source is rate-limited, the chart keeps showing its last real prices and says so instead of switching to made-up ones.
- Demo data (no keys) follows the same bar sizes and trading hours, generated backwards from today so extra lookback never changes the visible bars.

If the app doesn't pick up a code change, use Start menu > Market Reader > **Restart Market Reader** (it also clears the compiled cache).

## Stack

Next.js (App Router) and Tailwind CSS v4 for the web app, Supabase for sign-in, watchlists and portfolio data, Stripe for the Pro subscription, Expo for iOS and Android. Design tokens (colours, fonts) live once in `apps/web/app/globals.css` and are available as Tailwind classes such as `bg-paper`, `text-ink`, `text-muted`, `text-up`, `text-down` and `bg-accent`.

## The dashboard

`/dashboard` shows your portfolio and watchlist side by side.

- **Watchlist:** prices refresh every 15 seconds, and each price flashes green or red when it moves. When you're signed in, the list syncs through Supabase Realtime, so a symbol added on your phone or in another tab appears within a second.
- **Paper trading portfolio:** simulated money only. Every portfolio starts with $100,000 in cash. Buy and sell orders fill at the server's live price (the browser never supplies the price), and the holdings table, cash, total value and trade history update the moment you click, then confirm against the database. Selling more than you hold, or buying more than your cash covers, shows a toast and rolls the screen back. Holdings use the average-cost method; each sale records realized P&L = (sale price − average buy price) × shares. "Reset portfolio" starts over at $100,000. Nothing is ever sent to a broker.
  If you used the older hand-entered portfolio in a browser, its open positions are carried into the paper portfolio at their average cost, with the full $100,000 of paper cash on top.
- **Signed out:** both panels still work, saved in that browser only.

## Turn on accounts (Supabase)

1. Create a free project at https://supabase.com.
2. In the SQL editor, paste and run `supabase/schema.sql` (the whole schema in one file). Or, with the Supabase CLI, run `supabase db push` to apply `supabase/migrations/` in order. Use one or the other, not both.
   The schema covers profiles, watchlists, paper portfolios (portfolios, holdings, transactions), subscriptions and stock history. Every table has row-level security, the dashboard's tables have Realtime switched on, and the database itself caps watchlists at 10 symbols on Free and 500 on Pro. It was tested against Postgres 16 with Supabase's roles.
3. Under Authentication > URL Configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the redirect URLs (add your live address later).
4. For the phone app's 6-digit codes: under Authentication > Email Templates > Magic Link, add `{{ .Token }}` to the email body.
5. Optional: under Authentication > Providers, turn on Google for "Continue with Google" on the web.
6. Copy the project URL, anon key and service role key from Project Settings > API into `apps/web/.env.local`, and the URL and anon key into `apps/mobile/.env`.

## Turn on payments (Stripe)

**Quick way (no accounts needed):** put a Stripe **test** secret key in `apps/web/.env.local` (`STRIPE_SECRET_KEY=sk_test_...`) and restart. That's all: Plans > Upgrade to Pro opens Stripe Checkout for $20/month; pay with test card 4242 4242 4242 4242, any future date, any CVC. Stripe sends you back, the server confirms the payment with Stripe, and Pro switches on for that browser (kept in a signed cookie and re-checked with Stripe every few minutes). "Your plan" in the menu shows it and has **Cancel Pro**. No price id, webhook or database is needed; the $20/month price is created on the fly.

**With accounts (Supabase):** Pro is tied to the user instead, using the steps below.

Routes: `POST /api/stripe/checkout` starts Checkout, `POST /api/stripe/portal` opens the billing portal, and `POST /api/stripe/webhook` receives Stripe events. The webhook checks every event's `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` and rejects anything that fails.


1. In the Stripe dashboard (test mode), create a product "Market Reader Pro" with a recurring price of $20 per month. Copy its price id (`price_...`) into `STRIPE_PRICE_PRO`.
2. Copy your secret key (`sk_test_...`) into `STRIPE_SECRET_KEY`.
3. Turn on the customer portal (Settings > Billing > Customer portal) so people can cancel or change cards.
4. Webhook, locally: install the Stripe CLI and run `stripe listen --forward-to localhost:3000/api/stripe/webhook`; copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET`.
   In production: add an endpoint at `https://<your site>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.created`, `.updated` and `.deleted`.
5. Test with card number 4242 4242 4242 4242, any future date and any CVC.

Pro switches on when Stripe's webhook reaches the app and switches off automatically when a subscription ends or payment fails.

Because this is a class project, `apps/web/lib/billing.ts` rejects live keys (`sk_live_...`): with one set, payments stay off and checkout says to use a test key. The Plans page shows a "Test mode, no real charges" notice with the test card.

## Run the mobile app (optional)

The web app is the main deliverable; the phone app is an optional extra. It talks to the web app's server, so keep `npm run dev` running.

```
cd apps/mobile
npm install
npx expo install --fix
```

1. Find your computer's network address (Windows: `ipconfig`, look for IPv4 Address, e.g. 192.168.1.20).
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to your address, e.g. `http://192.168.1.20:3000`. Add the Supabase URL and anon key if accounts are on.
3. Run `npx expo start` and scan the QR code with the **Expo Go** app on your phone (same Wi-Fi as your computer).
   If Windows asks whether to allow Node.js on your network, allow it.

If Expo Go says the project's SDK version isn't supported, update it with `npx expo install expo@latest` and then `npx expo install --fix`.

## Project layout

```
packages/core      Shared TypeScript: types, the market data layer, provider adapters, indicators, formatting, tests
apps/web           Next.js web app and the server API that the mobile app also uses
  app/api/...      Data routes (markets, quote, quotes, history, profile, news, search) and AI routes
  lib/ai.ts        Claude tool-use loop: answers from Market Reader data, with sources
  lib/viewer.ts    Who is asking and on which plan (web cookie or mobile Bearer token)
  lib/billing.ts   Stripe: checkout, billing portal, subscription sync (routes in app/api/stripe/)
  lib/dashboard.ts Live data hooks: Supabase Realtime subscriptions and price refresh
  lib/paper.ts     Paper trading hooks: usePaperPortfolio, useSellStock, useBuyStock (optimistic, with rollback)
  app/api/trade    Places paper orders at the server's live price
  components/dashboard/  Tailwind dashboard: live watchlist, paper trading panel, trade history
apps/mobile        Expo (React Native) app for iOS and Android
supabase/          schema.sql (all-in-one), migrations/ and tests/: row-level security, Realtime, plan limits, trade functions
```

### How data is routed

All providers sit behind one data layer (`packages/core/src/data.ts`). Switching or adding a provider never touches the screens.

| Asset | Quotes | Charts | Profile and news |
| --- | --- | --- | --- |
| US stocks and ETFs | Finnhub | Massive up to 1Y; Tiingo for 5Y and MAX | Finnhub |
| Crypto | CoinGecko | CoinGecko up to 1Y; Kraken for 5Y and MAX (no key) | CoinGecko |
| Currencies | Frankfurter, daily | Frankfurter, daily (weekly view for 5Y and MAX, back to 1999) | none |
| International listings | Demo until a paid source is added | Demo | Demo |

Index levels (S&P 500, Nasdaq 100, Dow, Russell 2000) are shown through the ETFs that track them, because free plans don't carry index data.

## Paper trading in the database

`supabase/migrations/20261005000000_paper_trading.sql` (also at the end of `schema.sql`):

- **Tables.** `portfolios` (uuid id, user_id, name, starting_cash, cash_balance), `holdings` (portfolio_id, user_id, ticker, shares, avg_buy_price; one row per portfolio and ticker) and `transactions` (BUY or SELL, shares, execution_price, realized_pnl, created_at). Holdings and transactions reference their portfolio through `(portfolio_id, user_id)`, so a row can never sit in another user's portfolio. Indexes on `(portfolio_id, ticker)` and `(user_id, created_at desc)`.
- **Isolation.** Row-level security on all three: each signed-in user reads only their own rows. Users have no write access to holdings, transactions or cash at all; they can only create and rename portfolios. Signed-out visitors have no access. A new account gets a $100,000 paper portfolio automatically.
- **Orders.** `execute_sell_order(p_portfolio_id, p_ticker, p_shares_to_sell, p_current_price)` and `execute_buy_order(...)` run as one database transaction: lock the portfolio row, then the holding row (`FOR UPDATE`, always in that order), check ownership and quantity (`Insufficient shares to sell` / `Insufficient cash`), update or delete the holding, move the cash and insert the trade. Two sells of the same shares at once queue on the lock, and the second is refused. The functions run with elevated rights in a `private` schema that the API does not expose, check `auth.uid()` themselves, and are called through thin public wrappers that only signed-in users may execute.
- **Price.** The functions accept a price, so the app always calls them from `/api/trade` with the server's live quote. A signed-in user calling the database function directly could pass a made-up price; for simulated money that is an accepted limit of this class project. Locking it down would mean revoking the function from `authenticated` and calling it from the server with a service key.
- **Tests.** `supabase/tests/paper_trading_test.sql` checks the maths, both error messages, full-sell deletion, direct-write refusal, and that a second user can neither see nor trade in the first user's portfolio (32 checks, Postgres 16 with Supabase's roles).

## Checks

```
npm test            # core: data layer, chart windows and lookback, indicators, estimates, portfolio and paper-trading maths (45 tests)
npm run typecheck   # core and web
```

## Scope of this project

Market Reader is a classroom exercise and is not being launched. Its data comes from free tiers licensed for personal, non-commercial use, which fits a class project. A real launch would need commercial market-data licences, legal review of the price-range estimates, and app-store payment approval; those are outside the scope of this assignment.

## A note on OneDrive

This folder sits inside OneDrive. `npm install` creates thousands of files in `node_modules`, which OneDrive will try to sync. Consider moving the project to a folder outside OneDrive (for example `C:\dev\market-reader`) or pausing OneDrive sync while you work.
