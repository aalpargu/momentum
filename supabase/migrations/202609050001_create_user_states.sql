create table public.user_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null check (schema_version > 0),
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_states enable row level security;

revoke all on table public.user_states from anon, authenticated;
grant select, insert, update, delete on table public.user_states to authenticated;

create policy "Users can read their own Momentum state"
on public.user_states for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);
create policy "Users can create their own Momentum state"
on public.user_states for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update their own Momentum state"
on public.user_states for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete their own Momentum state"
on public.user_states for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);
