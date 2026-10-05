-- Market Reader: complete database schema in one file.
-- Paste into the Supabase SQL editor and run once on a new project.
-- (Same content as supabase/migrations/, in order. Use one or the other, not both.)
-- Tables: profiles, instruments, watchlists, watchlist_items, portfolios, holdings, transactions, alerts,
-- push_tokens, ai_conversations, ai_messages, ai_usage, quote_cache, subscriptions, symbol_history.
-- Paper trading (simulated money): portfolios, holdings and transactions are written only by the
-- execute_buy_order / execute_sell_order functions at the end of this file. Tests: supabase/tests/.
-- Every user table has row-level security; tested against Postgres 16 with Supabase's auth roles.

-- =====================================================================
-- 20261001000000_init.sql
-- =====================================================================
-- Market Reader: initial schema (milestone 0).
-- The app runs without this until milestone 4 (accounts), when watchlists and portfolios move here.
-- Every user-owned table has row-level security: each user can only see and change their own rows.

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  base_currency text not null default 'USD' check (char_length(base_currency) = 3),
  created_at timestamptz not null default now()
);

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Instruments (shared reference data, readable by everyone) ----------
create type public.asset_class as enum ('stock', 'etf', 'crypto', 'forex', 'index');

create table public.instruments (
  id bigint generated always as identity primary key,
  symbol text not null unique,
  name text not null,
  asset_class public.asset_class not null,
  exchange text not null,
  currency text not null check (char_length(currency) = 3),
  country text not null,
  provider_ids jsonb not null default '{}'::jsonb
);
create index instruments_name_idx on public.instruments using gin (to_tsvector('simple', name));

-- ---------- Watchlists ----------
create table public.watchlists (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My watchlist',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index watchlists_user_id_idx on public.watchlists (user_id);

create table public.watchlist_items (
  watchlist_id bigint not null references public.watchlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (watchlist_id, symbol)
);
create index watchlist_items_user_id_idx on public.watchlist_items (user_id);

-- ---------- Portfolios (entered by hand; no brokerage connection) ----------
create table public.portfolios (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My portfolio',
  base_currency text not null default 'USD' check (char_length(base_currency) = 3),
  created_at timestamptz not null default now()
);
create index portfolios_user_id_idx on public.portfolios (user_id);

create type public.transaction_type as enum ('buy', 'sell', 'dividend');

create table public.transactions (
  id bigint generated always as identity primary key,
  portfolio_id bigint not null references public.portfolios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  type public.transaction_type not null,
  quantity numeric(28, 10) not null check (quantity >= 0),
  price numeric(28, 10) not null check (price >= 0),
  fee numeric(18, 4) not null default 0 check (fee >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  traded_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);
create index transactions_portfolio_id_idx on public.transactions (portfolio_id, traded_at);
create index transactions_user_id_idx on public.transactions (user_id);

-- ---------- Price alerts ----------
create type public.alert_condition as enum ('price_above', 'price_below', 'change_pct_above', 'change_pct_below');

create table public.alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  condition public.alert_condition not null,
  threshold numeric(28, 10) not null,
  channel text not null default 'push' check (channel in ('push', 'email', 'both')),
  active boolean not null default true,
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_user_id_idx on public.alerts (user_id);
create index alerts_active_symbol_idx on public.alerts (symbol) where active;

create table public.push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_token)
);

-- ---------- AI assistant ----------
create table public.ai_conversations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);
create index ai_conversations_user_id_idx on public.ai_conversations (user_id, created_at desc);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  tokens_used integer,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_id_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_user_id_idx on public.ai_messages (user_id);

-- Daily quota counter. Written by the server (service role) only.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests integer not null default 0,
  tokens integer not null default 0,
  primary key (user_id, day)
);

-- Server-side cache for provider responses. No client access.
create table public.quote_cache (
  symbol text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.instruments enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.portfolios enable row level security;
alter table public.transactions enable row level security;
alter table public.alerts enable row level security;
alter table public.push_tokens enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
alter table public.quote_cache enable row level security;

create policy "Profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Instruments: anyone can read" on public.instruments for select to anon, authenticated using (true);

-- Owner-only access for each user table (select, insert, update, delete).
create policy "Watchlists: own rows" on public.watchlists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Watchlist items: own rows" on public.watchlist_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
create policy "Portfolios: own rows" on public.portfolios for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Transactions: own rows" on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())));
create policy "Alerts: own rows" on public.alerts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Push tokens: own rows" on public.push_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "AI conversations: own rows" on public.ai_conversations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "AI messages: read own" on public.ai_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "AI usage: read own" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);
-- ai_messages inserts, ai_usage writes and quote_cache are done by the server with the service role key.

-- =====================================================================
-- 20261001010000_plans_and_history.sql
-- =====================================================================
-- Market Reader: plans (Free / Pro via Stripe) and saved stock history.

-- ---------- Subscriptions (written only by the Stripe webhook, using the service role) ----------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null default 'none', -- Stripe status: trialing, active, past_due, canceled, unpaid, incomplete...
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "Subscriptions: read own" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- The signed-in user's plan ('free' or 'pro'). Only ever reports on the caller.
create or replace function public.current_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    ) then 'pro'
    else 'free'
  end;
$$;
revoke execute on function public.current_plan() from public, anon;
grant execute on function public.current_plan() to authenticated;

-- ---------- Saved stock history ("past stock selections") ----------
-- One row per symbol per user. Records when you first and last looked at it, the price then,
-- and whether you saved it to a watchlist, so the app can show how it has done since.
create table public.symbol_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_price numeric(28, 10),
  first_currency text,
  view_count integer not null default 1,
  saved boolean not null default false,
  unique (user_id, symbol)
);
create index symbol_history_user_last_seen_idx on public.symbol_history (user_id, last_seen_at desc);

alter table public.symbol_history enable row level security;
create policy "Symbol history: own rows" on public.symbol_history for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Record a view (or a save) in one round trip. Keeps the first price; bumps last_seen and the count.
create or replace function public.record_symbol_view(p_symbol text, p_price numeric, p_currency text, p_saved boolean default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.symbol_history (user_id, symbol, first_price, first_currency, saved)
  values ((select auth.uid()), upper(p_symbol), p_price, p_currency, coalesce(p_saved, false))
  on conflict (user_id, symbol) do update
    set last_seen_at = now(),
        view_count = public.symbol_history.view_count + 1,
        saved = coalesce(p_saved, public.symbol_history.saved);
$$;
grant execute on function public.record_symbol_view(text, numeric, text, boolean) to authenticated;

-- Free plan keeps only the 10 most recent entries; Pro keeps everything.
-- Called by the server after recording a view for a free user.
create or replace function public.trim_symbol_history(keep integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.symbol_history h
  where h.user_id = (select auth.uid())
    and h.saved = false
    and h.id not in (
      select id from public.symbol_history
      where user_id = (select auth.uid())
      order by last_seen_at desc
      limit keep
    );
$$;
grant execute on function public.trim_symbol_history(integer) to authenticated;

-- One default watchlist per user, so the app can upsert into it without a lookup.
create unique index watchlists_one_default_idx on public.watchlists (user_id) where position = 0;

-- =====================================================================
-- 20261001020000_realtime_and_limits.sql
-- =====================================================================
-- Market Reader: live updates for the dashboard, and plan limits enforced in the database.

-- ---------- Realtime ----------
-- The dashboard subscribes to changes on these tables, so a symbol added on the phone
-- appears on the web straight away (and the reverse). Row-level security still applies:
-- each user only receives events for their own rows.
alter publication supabase_realtime add table public.watchlist_items, public.transactions;

-- Include the full old row on deletes so clients can tell which symbol was removed.
alter table public.watchlist_items replica identity full;
alter table public.transactions replica identity full;

-- ---------- Watchlist size per plan ----------
-- Free: 10 symbols, Pro: 500. Enforced here so it holds no matter which client writes
-- (web API, dashboard writing directly through Supabase, or the phone app).
create or replace function public.enforce_watchlist_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  max_allowed integer;
begin
  select count(*) into used from public.watchlist_items where user_id = new.user_id;
  max_allowed := case when public.current_plan() = 'pro' then 500 else 10 end;
  if used >= max_allowed then
    raise exception 'Your plan holds up to % symbols. Upgrade to Pro for more.', max_allowed
      using errcode = 'P0001', hint = 'watchlist_limit';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_watchlist_limit() from public, anon, authenticated;

create trigger watchlist_items_limit
  before insert on public.watchlist_items
  for each row execute function public.enforce_watchlist_limit();

-- A user's first portfolio, created on demand by the dashboard.
create unique index portfolios_one_default_idx on public.portfolios (user_id, name);

-- =====================================================================
-- 20261005000000_paper_trading.sql
-- =====================================================================
-- Market Reader: paper trading (simulated, no real money).
--
-- Replaces the hand-entered ledger (bigint portfolios / transactions) with per-user paper portfolios:
--   portfolios    one or more per user, each with a simulated cash balance (starts at $100,000)
--   holdings      one row per (portfolio, ticker): shares held and average buy price
--   transactions  every executed BUY or SELL, with the realized P&L of each sale
--
-- Isolation: every row carries user_id, and holdings/transactions point at their portfolio through a
-- composite key (portfolio_id, user_id), so a row can never belong to one user while sitting in
-- another user's portfolio. Row-level security lets each user read only their own rows. Users cannot
-- write holdings or transactions directly at all: trades go through execute_buy_order /
-- execute_sell_order, which lock the rows, validate, and apply every change in one transaction.

-- ---------- Retire the old hand-entered ledger ----------
-- Refuse to run if anyone has recorded transactions in the old table, rather than silently losing them.
do $$
begin
  if to_regclass('public.transactions') is not null
     and exists (select 1 from public.transactions limit 1) then
    raise exception 'public.transactions already has rows. Export them before running the paper-trading migration.';
  end if;
end;
$$;

drop table if exists public.transactions;
drop table if exists public.portfolios;
drop type if exists public.transaction_type;

-- ---------- Tables ----------
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null default 'Paper portfolio' check (char_length(btrim(name)) between 1 and 60),
  starting_cash numeric(20, 2) not null default 100000 check (starting_cash >= 0),
  cash_balance numeric(20, 2) not null default 100000 check (cash_balance >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  -- Target for the composite foreign keys below (ties child rows to the portfolio's owner).
  unique (id, user_id)
);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null,
  user_id uuid not null,
  ticker varchar(20) not null check (char_length(ticker) >= 1 and ticker = upper(ticker)),
  shares numeric(28, 10) not null check (shares > 0),
  avg_buy_price numeric(28, 10) not null check (avg_buy_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holdings_portfolio_ticker_key unique (portfolio_id, ticker),
  constraint holdings_portfolio_owner_fkey foreign key (portfolio_id, user_id)
    references public.portfolios (id, user_id) on delete cascade
);
create index holdings_user_id_idx on public.holdings (user_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null,
  user_id uuid not null,
  ticker varchar(20) not null check (char_length(ticker) >= 1 and ticker = upper(ticker)),
  type text not null check (type in ('BUY', 'SELL')),
  shares numeric(28, 10) not null check (shares > 0),
  execution_price numeric(28, 10) not null check (execution_price > 0),
  -- Profit or loss locked in by a sale, (execution_price - avg_buy_price) * shares. Null for buys.
  realized_pnl numeric(20, 2),
  created_at timestamptz not null default now(),
  constraint transactions_pnl_only_on_sell check ((type = 'SELL') = (realized_pnl is not null)),
  constraint transactions_portfolio_owner_fkey foreign key (portfolio_id, user_id)
    references public.portfolios (id, user_id) on delete cascade
);
create index transactions_portfolio_ticker_idx on public.transactions (portfolio_id, ticker);
create index transactions_user_created_idx on public.transactions (user_id, created_at desc);

-- ---------- Row-level security ----------
alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;
alter table public.transactions enable row level security;

-- Supabase grants everything on new public tables to anon and authenticated by default.
-- Take that back and grant only what the app needs: reading your rows, and naming portfolios.
revoke all on table public.portfolios, public.holdings, public.transactions from anon, authenticated;
grant select on table public.portfolios, public.holdings, public.transactions to authenticated;
grant insert (name), update (name) on table public.portfolios to authenticated;

create policy "Portfolios: read own" on public.portfolios for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Portfolios: create own" on public.portfolios for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Portfolios: rename own" on public.portfolios for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Holdings: read own" on public.holdings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Transactions: read own" on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);
-- No insert/update/delete policies or grants on holdings and transactions: only the trade functions write them.

-- ---------- Every account starts with a paper portfolio ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  insert into public.portfolios (user_id) values (new.id);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Existing accounts get one too.
insert into public.portfolios (user_id)
select p.id from public.profiles p
on conflict do nothing;

-- ---------- Trade execution ----------
-- The functions that change balances run as SECURITY DEFINER (users have no write access to these
-- tables), so they live in a schema the Data API does not expose, check auth.uid() themselves, and
-- are reached through thin SECURITY INVOKER wrappers in public.
-- Lock order is always portfolio, then holding, so concurrent trades queue instead of deadlocking.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.execute_sell_order(
  p_portfolio_id uuid,
  p_ticker text,
  p_shares_to_sell numeric,
  p_current_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ticker text := upper(btrim(coalesce(p_ticker, '')));
  v_holding public.holdings%rowtype;
  v_proceeds numeric;
  v_pnl numeric;
  v_remaining numeric;
  v_cash numeric;
  v_tx_id uuid;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to trade.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if v_ticker = '' or char_length(v_ticker) > 20 then
    raise exception 'Enter a valid ticker.' using errcode = '22023', hint = 'invalid_ticker';
  end if;
  if p_shares_to_sell is null or p_shares_to_sell <= 0 then
    raise exception 'Shares to sell must be greater than zero.' using errcode = '22023', hint = 'invalid_shares';
  end if;
  if p_current_price is null or p_current_price <= 0 then
    raise exception 'No valid price to execute at.' using errcode = '22023', hint = 'invalid_price';
  end if;

  -- 1. Lock the portfolio (and prove the caller owns it; someone else's portfolio looks "not found").
  perform 1 from public.portfolios
   where id = p_portfolio_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'Portfolio not found.' using errcode = 'P0002', hint = 'portfolio_not_found';
  end if;

  -- 2. Lock the holding and check there are enough shares.
  select * into v_holding from public.holdings
   where portfolio_id = p_portfolio_id and ticker = v_ticker
   for update;
  if not found or v_holding.shares < p_shares_to_sell then
    raise exception 'Insufficient shares to sell'
      using errcode = 'P0001', hint = 'insufficient_shares',
            detail = format('Held %s %s, tried to sell %s.', coalesce(v_holding.shares, 0), v_ticker, p_shares_to_sell);
  end if;

  v_proceeds := round(p_shares_to_sell * p_current_price, 2);
  v_pnl := round((p_current_price - v_holding.avg_buy_price) * p_shares_to_sell, 2);
  v_remaining := v_holding.shares - p_shares_to_sell;

  -- 3. Close or shrink the position. The average buy price of the remaining shares is unchanged.
  if v_remaining = 0 then
    delete from public.holdings where id = v_holding.id;
  else
    update public.holdings set shares = v_remaining, updated_at = now() where id = v_holding.id;
  end if;

  -- 4. Credit the cash.
  update public.portfolios set cash_balance = cash_balance + v_proceeds
   where id = p_portfolio_id
   returning cash_balance into v_cash;

  -- 5. Record the trade.
  insert into public.transactions (portfolio_id, user_id, ticker, type, shares, execution_price, realized_pnl)
  values (p_portfolio_id, v_uid, v_ticker, 'SELL', p_shares_to_sell, p_current_price, v_pnl)
  returning id, created_at into v_tx_id, v_created;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'portfolio_id', p_portfolio_id,
    'ticker', v_ticker,
    'type', 'SELL',
    'shares', p_shares_to_sell,
    'execution_price', p_current_price,
    'proceeds', v_proceeds,
    'realized_pnl', v_pnl,
    'avg_buy_price', v_holding.avg_buy_price,
    'remaining_shares', v_remaining,
    'cash_balance', v_cash,
    'created_at', v_created
  );
end;
$$;

create or replace function private.execute_buy_order(
  p_portfolio_id uuid,
  p_ticker text,
  p_shares_to_buy numeric,
  p_current_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ticker text := upper(btrim(coalesce(p_ticker, '')));
  v_cost numeric;
  v_cash numeric;
  v_shares numeric;
  v_avg numeric;
  v_tx_id uuid;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to trade.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if v_ticker = '' or char_length(v_ticker) > 20 then
    raise exception 'Enter a valid ticker.' using errcode = '22023', hint = 'invalid_ticker';
  end if;
  if p_shares_to_buy is null or p_shares_to_buy <= 0 then
    raise exception 'Shares to buy must be greater than zero.' using errcode = '22023', hint = 'invalid_shares';
  end if;
  if p_current_price is null or p_current_price <= 0 then
    raise exception 'No valid price to execute at.' using errcode = '22023', hint = 'invalid_price';
  end if;

  select cash_balance into v_cash from public.portfolios
   where id = p_portfolio_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'Portfolio not found.' using errcode = 'P0002', hint = 'portfolio_not_found';
  end if;

  v_cost := round(p_shares_to_buy * p_current_price, 2);
  if v_cost > v_cash then
    raise exception 'Insufficient cash'
      using errcode = 'P0001', hint = 'insufficient_cash',
            detail = format('Cost %s, cash available %s.', v_cost, v_cash);
  end if;

  -- Add to the position; the average buy price becomes the share-weighted average.
  insert into public.holdings as h (portfolio_id, user_id, ticker, shares, avg_buy_price)
  values (p_portfolio_id, v_uid, v_ticker, p_shares_to_buy, p_current_price)
  on conflict (portfolio_id, ticker) do update
     set avg_buy_price = (h.shares * h.avg_buy_price + excluded.shares * excluded.avg_buy_price) / (h.shares + excluded.shares),
         shares = h.shares + excluded.shares,
         updated_at = now()
  returning shares, avg_buy_price into v_shares, v_avg;

  update public.portfolios set cash_balance = cash_balance - v_cost
   where id = p_portfolio_id
   returning cash_balance into v_cash;

  insert into public.transactions (portfolio_id, user_id, ticker, type, shares, execution_price, realized_pnl)
  values (p_portfolio_id, v_uid, v_ticker, 'BUY', p_shares_to_buy, p_current_price, null)
  returning id, created_at into v_tx_id, v_created;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'portfolio_id', p_portfolio_id,
    'ticker', v_ticker,
    'type', 'BUY',
    'shares', p_shares_to_buy,
    'execution_price', p_current_price,
    'cost', v_cost,
    'total_shares', v_shares,
    'avg_buy_price', v_avg,
    'cash_balance', v_cash,
    'created_at', v_created
  );
end;
$$;

-- Start over: clear positions and history and restore the starting cash.
create or replace function private.reset_paper_portfolio(p_portfolio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cash numeric;
begin
  if v_uid is null then
    raise exception 'Sign in to trade.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  update public.portfolios set cash_balance = starting_cash
   where id = p_portfolio_id and user_id = v_uid
   returning cash_balance into v_cash;
  if not found then
    raise exception 'Portfolio not found.' using errcode = 'P0002', hint = 'portfolio_not_found';
  end if;
  delete from public.holdings where portfolio_id = p_portfolio_id;
  delete from public.transactions where portfolio_id = p_portfolio_id;
  return jsonb_build_object('portfolio_id', p_portfolio_id, 'cash_balance', v_cash);
end;
$$;

revoke execute on function private.execute_sell_order(uuid, text, numeric, numeric) from public, anon;
revoke execute on function private.execute_buy_order(uuid, text, numeric, numeric) from public, anon;
revoke execute on function private.reset_paper_portfolio(uuid) from public, anon;
grant execute on function private.execute_sell_order(uuid, text, numeric, numeric) to authenticated;
grant execute on function private.execute_buy_order(uuid, text, numeric, numeric) to authenticated;
grant execute on function private.reset_paper_portfolio(uuid) to authenticated;

-- Public entry points (callable as supabase.rpc('execute_sell_order', {...})).
create or replace function public.execute_sell_order(p_portfolio_id uuid, p_ticker text, p_shares_to_sell numeric, p_current_price numeric)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.execute_sell_order(p_portfolio_id, p_ticker, p_shares_to_sell, p_current_price) $$;

create or replace function public.execute_buy_order(p_portfolio_id uuid, p_ticker text, p_shares_to_buy numeric, p_current_price numeric)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.execute_buy_order(p_portfolio_id, p_ticker, p_shares_to_buy, p_current_price) $$;

create or replace function public.reset_paper_portfolio(p_portfolio_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.reset_paper_portfolio(p_portfolio_id) $$;

revoke execute on function public.execute_sell_order(uuid, text, numeric, numeric) from public, anon;
revoke execute on function public.execute_buy_order(uuid, text, numeric, numeric) from public, anon;
revoke execute on function public.reset_paper_portfolio(uuid) from public, anon;
grant execute on function public.execute_sell_order(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.execute_buy_order(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.reset_paper_portfolio(uuid) to authenticated;

-- ---------- Realtime ----------
-- The dashboard refreshes when a trade lands from another tab or device. RLS still applies.
alter publication supabase_realtime add table public.portfolios, public.holdings, public.transactions;
alter table public.portfolios replica identity full;
alter table public.holdings replica identity full;
alter table public.transactions replica identity full;
