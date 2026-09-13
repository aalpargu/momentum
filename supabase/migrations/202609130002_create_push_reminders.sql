create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 20 and 255),
  auth_key text not null check (char_length(auth_key) between 8 and 255),
  timezone text not null check (char_length(timezone) between 1 and 100),
  enabled boolean not null default true,
  plan_time time not null,
  habits_time time not null,
  reflection_time time not null,
  weekly_enabled boolean not null default true,
  weekly_time time not null,
  last_plan_date date,
  last_habits_date date,
  last_reflection_date date,
  last_weekly_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

drop policy if exists "Users can read their own push subscriptions" on public.push_subscriptions;
create policy "Users can read their own push subscriptions"
on public.push_subscriptions for select to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can create their own push subscriptions" on public.push_subscriptions;
create policy "Users can create their own push subscriptions"
on public.push_subscriptions for insert to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can update their own push subscriptions" on public.push_subscriptions;
create policy "Users can update their own push subscriptions"
on public.push_subscriptions for update to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can delete their own push subscriptions" on public.push_subscriptions;
create policy "Users can delete their own push subscriptions"
on public.push_subscriptions for delete to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create or replace function private.validate_push_subscription_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.validate_push_subscription_timezone() from public, anon, authenticated;
drop trigger if exists validate_push_subscription_timezone on public.push_subscriptions;
create trigger validate_push_subscription_timezone
before insert or update on public.push_subscriptions
for each row execute function private.validate_push_subscription_timezone();

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'momentum_push_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'momentum_push_cron_secret', 'Authenticates the Momentum push reminder cron invocation');
  end if;
end;
$$;

create or replace function public.claim_due_push_notifications(cron_secret text, batch_size integer default 50)
returns table (subscription_id uuid, endpoint text, p256dh text, auth_key text, notification_kind text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cron_secret is null or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'momentum_push_cron_secret' and decrypted_secret = cron_secret
  ) then
    raise exception 'Invalid cron credential' using errcode = '42501';
  end if;

  return query
  with candidates as materialized (
    select p.id,
      case
        when local_clock.local_time >= p.plan_time and local_clock.local_time < p.plan_time + interval '10 minutes' and p.last_plan_date is distinct from local_clock.local_date then 'plan'
        when local_clock.local_time >= p.habits_time and local_clock.local_time < p.habits_time + interval '10 minutes' and p.last_habits_date is distinct from local_clock.local_date then 'habits'
        when local_clock.local_time >= p.reflection_time and local_clock.local_time < p.reflection_time + interval '10 minutes' and p.last_reflection_date is distinct from local_clock.local_date then 'reflection'
        when p.weekly_enabled and extract(dow from local_clock.local_date) = 0 and local_clock.local_time >= p.weekly_time and local_clock.local_time < p.weekly_time + interval '10 minutes' and p.last_weekly_date is distinct from local_clock.local_date then 'weekly'
      end as kind,
      local_clock.local_date
    from public.push_subscriptions p
    cross join lateral (
      select (now() at time zone p.timezone)::date as local_date,
             (now() at time zone p.timezone)::time as local_time
    ) local_clock
    where p.enabled and (
      (local_clock.local_time >= p.plan_time and local_clock.local_time < p.plan_time + interval '10 minutes' and p.last_plan_date is distinct from local_clock.local_date)
      or (local_clock.local_time >= p.habits_time and local_clock.local_time < p.habits_time + interval '10 minutes' and p.last_habits_date is distinct from local_clock.local_date)
      or (local_clock.local_time >= p.reflection_time and local_clock.local_time < p.reflection_time + interval '10 minutes' and p.last_reflection_date is distinct from local_clock.local_date)
      or (p.weekly_enabled and extract(dow from local_clock.local_date) = 0 and local_clock.local_time >= p.weekly_time and local_clock.local_time < p.weekly_time + interval '10 minutes' and p.last_weekly_date is distinct from local_clock.local_date)
    )
    order by p.updated_at
    for update of p skip locked
    limit greatest(1, least(coalesce(batch_size, 50), 100))
  ), updated as (
    update public.push_subscriptions p set
      last_plan_date = case when c.kind = 'plan' then c.local_date else p.last_plan_date end,
      last_habits_date = case when c.kind = 'habits' then c.local_date else p.last_habits_date end,
      last_reflection_date = case when c.kind = 'reflection' then c.local_date else p.last_reflection_date end,
      last_weekly_date = case when c.kind = 'weekly' then c.local_date else p.last_weekly_date end,
      updated_at = now()
    from candidates c
    where p.id = c.id
    returning p.id, p.endpoint, p.p256dh, p.auth_key, c.kind
  )
  select id, updated.endpoint, updated.p256dh, updated.auth_key, kind from updated;
end;
$$;

revoke all on function public.claim_due_push_notifications(text, integer) from public, anon, authenticated;
grant execute on function public.claim_due_push_notifications(text, integer) to service_role;

do $$
begin
  perform cron.unschedule('momentum-push-reminders');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'momentum-push-reminders',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://fafmrvzpvackjyeonnfu.supabase.co/functions/v1/push-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'momentum_push_cron_secret')
      ),
      body := '{"action":"dispatch"}'::jsonb
    ) as request_id;
  $job$
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
