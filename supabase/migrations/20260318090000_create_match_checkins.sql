create table if not exists public.match_checkins (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.fixtures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists match_checkins_unique_match_user
  on public.match_checkins(match_id, user_id);

create index if not exists match_checkins_match_idx
  on public.match_checkins(match_id);

create index if not exists match_checkins_user_idx
  on public.match_checkins(user_id);

alter table public.match_checkins enable row level security;

drop policy if exists match_checkins_select_public on public.match_checkins;
create policy match_checkins_select_public on public.match_checkins
for select using (true);

drop policy if exists match_checkins_insert_self on public.match_checkins;
create policy match_checkins_insert_self on public.match_checkins
for insert with check (auth.uid() = user_id);

drop policy if exists match_checkins_delete_self on public.match_checkins;
create policy match_checkins_delete_self on public.match_checkins
for delete using (auth.uid() = user_id);
