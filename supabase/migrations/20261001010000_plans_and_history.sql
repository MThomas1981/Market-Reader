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
