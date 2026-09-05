create schema if not exists private;

create table private.ai_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

alter table private.ai_daily_usage enable row level security;

revoke all on table private.ai_daily_usage from public, anon, authenticated;

create or replace function public.claim_ai_daily_quota(daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  claimed integer;
begin
  if caller_id is null or daily_limit < 1 or daily_limit > 100 then
    return false;
  end if;

  insert into private.ai_daily_usage (user_id, usage_date, request_count)
  values (caller_id, current_date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = private.ai_daily_usage.request_count + 1
    where private.ai_daily_usage.request_count < daily_limit
  returning request_count into claimed;

  return claimed is not null;
end;
$$;

revoke all on function public.claim_ai_daily_quota(integer) from public, anon;
grant execute on function public.claim_ai_daily_quota(integer) to authenticated;
