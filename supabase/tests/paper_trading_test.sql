-- Tests for the paper-trading migration. Run against a scratch database that has Supabase's auth
-- roles (anon, authenticated, auth.uid()) and every migration applied. Any failed check raises.
\set ON_ERROR_STOP 1

-- Two accounts. Signing up creates a profile and a $100,000 paper portfolio for each.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

create temporary table ctx as
select (select id from public.portfolios where user_id = '11111111-1111-1111-1111-111111111111') as alice_pf,
       (select id from public.portfolios where user_id = '22222222-2222-2222-2222-222222222222') as bob_pf;
grant select on ctx to authenticated, anon;

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated, anon;

-- ---------- Alice trades ----------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select pg_temp.check((select count(*) from public.portfolios) = 1, 'new user sees exactly one portfolio');
select pg_temp.check((select cash_balance from public.portfolios) = 100000, 'starting cash is 100000');

select public.execute_buy_order((select alice_pf from ctx), 'msft', 100, 400);
select public.execute_buy_order((select alice_pf from ctx), 'MSFT', 50, 430);
select pg_temp.check((select shares from public.holdings where ticker = 'MSFT') = 150, 'buys add up to 150 shares');
select pg_temp.check((select round(avg_buy_price, 4) from public.holdings where ticker = 'MSFT') = 410, 'weighted average buy price is 410');
select pg_temp.check((select cash_balance from public.portfolios) = 100000 - 40000 - 21500, 'cash debited for both buys');

-- Partial sell: (450 - 410) * 60 = 2400 realized; cash + 27000.
select pg_temp.check(
  (select (r ->> 'realized_pnl')::numeric = 2400 and (r ->> 'remaining_shares')::numeric = 90 and (r ->> 'proceeds')::numeric = 27000
     from (select public.execute_sell_order((select alice_pf from ctx), 'MSFT', 60, 450) as r) s),
  'partial sell returns proceeds 27000, P&L 2400, 90 left');
select pg_temp.check((select shares from public.holdings where ticker = 'MSFT') = 90, 'holding decremented to 90');
select pg_temp.check((select round(avg_buy_price, 4) from public.holdings where ticker = 'MSFT') = 410, 'average buy price unchanged by a sale');
select pg_temp.check((select cash_balance from public.portfolios) = 38500 + 27000, 'cash credited with proceeds');

-- Overselling fails with the agreed message and changes nothing.
do $$
begin
  perform public.execute_sell_order((select alice_pf from ctx), 'MSFT', 91, 450);
  raise exception 'FAILED: oversell was allowed';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'Insufficient shares to sell' then raise exception 'FAILED: wrong message %', sqlerrm; end if;
  raise notice 'ok - selling 91 of 90 raises "Insufficient shares to sell"';
end $$;
do $$
begin
  perform public.execute_sell_order((select alice_pf from ctx), 'AAPL', 1, 200);
  raise exception 'FAILED: selling an unheld ticker was allowed';
exception when sqlstate 'P0001' then
  raise notice 'ok - selling a ticker you do not hold raises "%"', sqlerrm;
end $$;
select pg_temp.check((select shares from public.holdings where ticker = 'MSFT') = 90, 'failed sells left the holding alone');
select pg_temp.check((select count(*) from public.transactions) = 3, 'failed sells left no transaction rows');

-- Losing sale of the rest: (380 - 410) * 90 = -2700; the holding row is deleted.
select pg_temp.check(
  (select (public.execute_sell_order((select alice_pf from ctx), 'MSFT', 90, 380) ->> 'realized_pnl')::numeric) = -2700,
  'full sell at a loss realizes -2700');
select pg_temp.check(not exists (select 1 from public.holdings where ticker = 'MSFT'), 'fully sold holding is deleted');
select pg_temp.check((select cash_balance from public.portfolios) = 65500 + 34200, 'cash after full sell');
select pg_temp.check((select sum(realized_pnl) from public.transactions where type = 'SELL') = -300, 'history shows total realized P&L of -300');

do $$
begin
  perform public.execute_buy_order((select alice_pf from ctx), 'NVDA', 1000, 200);
  raise exception 'FAILED: overspending was allowed';
exception when sqlstate 'P0001' then
  raise notice 'ok - buying more than cash allows raises "%"', sqlerrm;
end $$;

-- Users cannot write balances, holdings or history directly.
do $$
begin
  update public.portfolios set cash_balance = 1e9;
  raise exception 'FAILED: user changed their own cash';
exception when insufficient_privilege then raise notice 'ok - direct cash update refused';
end $$;
do $$
begin
  insert into public.holdings (portfolio_id, user_id, ticker, shares, avg_buy_price)
  values ((select alice_pf from ctx), '11111111-1111-1111-1111-111111111111', 'AAPL', 10, 1);
  raise exception 'FAILED: user inserted a holding directly';
exception when insufficient_privilege then raise notice 'ok - direct holding insert refused';
end $$;
do $$
begin
  delete from public.transactions;
  raise exception 'FAILED: user deleted history';
exception when insufficient_privilege then raise notice 'ok - direct history delete refused';
end $$;
-- Renaming is allowed.
update public.portfolios set name = 'Class project';
select pg_temp.check((select name from public.portfolios) = 'Class project', 'user can rename their portfolio');

-- ---------- Bob cannot see or touch Alice's data ----------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check((select count(*) from public.portfolios) = 1 and (select id from public.portfolios) = (select bob_pf from ctx), 'Bob sees only his portfolio');
select pg_temp.check((select count(*) from public.transactions) = 0, 'Bob sees none of Alice''s transactions');
do $$
begin
  perform public.execute_buy_order((select alice_pf from ctx), 'AAPL', 1, 100);
  raise exception 'FAILED: Bob traded in Alice''s portfolio';
exception when sqlstate 'P0002' then raise notice 'ok - Bob trading in Alice''s portfolio gets "Portfolio not found"';
end $$;
update public.portfolios set name = 'hijacked' where id = (select alice_pf from ctx);
do $$
begin
  perform public.reset_paper_portfolio((select alice_pf from ctx));
  raise exception 'FAILED: Bob reset Alice''s portfolio';
exception when sqlstate 'P0002' then raise notice 'ok - Bob cannot reset Alice''s portfolio';
end $$;
do $$
begin
  insert into public.portfolios (name, user_id) values ('sneaky', '11111111-1111-1111-1111-111111111111');
  raise exception 'FAILED: Bob created a portfolio for Alice';
exception when insufficient_privilege then raise notice 'ok - Bob cannot create a portfolio owned by Alice';
end $$;
insert into public.portfolios (name) values ('Second portfolio');
select pg_temp.check((select count(*) from public.portfolios) = 2, 'Bob can add a second portfolio of his own');

-- ---------- Signed out ----------
reset request.jwt.claim.sub;
set role anon;
do $$
begin
  perform public.execute_sell_order((select alice_pf from ctx), 'MSFT', 1, 1);
  raise exception 'FAILED: anon called the RPC';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot call the trade functions';
end $$;
do $$
begin
  perform 1 from public.portfolios;
  raise exception 'FAILED: anon read portfolios';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot read portfolios';
end $$;

reset role;
select pg_temp.check((select name from public.portfolios where id = (select alice_pf from ctx)) = 'Class project', 'Alice''s portfolio name untouched by Bob');

-- Reset restores the starting cash and clears positions and history.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.execute_buy_order((select alice_pf from ctx), 'AAPL', 3, 100);
select public.reset_paper_portfolio((select alice_pf from ctx));
select pg_temp.check((select cash_balance from public.portfolios) = 100000
  and not exists (select 1 from public.holdings) and not exists (select 1 from public.transactions), 'reset restores 100000 and clears everything');
reset role;
