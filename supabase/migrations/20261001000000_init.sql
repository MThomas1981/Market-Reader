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
