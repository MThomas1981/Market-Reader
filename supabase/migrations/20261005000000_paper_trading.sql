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
