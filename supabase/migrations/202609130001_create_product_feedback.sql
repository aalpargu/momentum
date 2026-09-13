create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('idea', 'problem', 'experience', 'crash')),
  message text not null check (char_length(message) between 10 and 2000),
  app_version text not null check (char_length(app_version) between 1 and 30),
  page_path text check (page_path is null or char_length(page_path) <= 200),
  diagnostics jsonb not null default '[]'::jsonb check (jsonb_typeof(diagnostics) = 'array'),
  created_at timestamptz not null default now()
);

alter table public.product_feedback enable row level security;

revoke all on table public.product_feedback from anon;
revoke all on table public.product_feedback from authenticated;
grant insert on table public.product_feedback to authenticated;

drop policy if exists "Users can submit their own Momentum feedback" on public.product_feedback;
create policy "Users can submit their own Momentum feedback"
on public.product_feedback
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

create or replace function private.enforce_product_feedback_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.product_feedback
    where user_id = new.user_id
      and created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Daily feedback limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_product_feedback_daily_limit() from public, anon, authenticated;

drop trigger if exists product_feedback_daily_limit on public.product_feedback;
create trigger product_feedback_daily_limit
before insert on public.product_feedback
for each row execute function private.enforce_product_feedback_daily_limit();

create index if not exists product_feedback_user_created_idx
on public.product_feedback (user_id, created_at desc);
