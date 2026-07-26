create table if not exists public.tripflow_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.tripflow_data enable row level security;
create policy "read own tripflow data" on public.tripflow_data for select using (auth.uid() = user_id);
create policy "insert own tripflow data" on public.tripflow_data for insert with check (auth.uid() = user_id);
create policy "update own tripflow data" on public.tripflow_data for update using (auth.uid() = user_id);
