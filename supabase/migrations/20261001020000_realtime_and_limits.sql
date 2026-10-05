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
