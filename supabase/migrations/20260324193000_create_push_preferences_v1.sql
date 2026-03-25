create table if not exists public.push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  replies_enabled boolean not null default true,
  matchday_checkin_enabled boolean not null default true,
  community_activity_enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists push_preferences_updated_at_idx
  on public.push_preferences(updated_at desc);

alter table public.push_preferences enable row level security;

drop policy if exists push_preferences_select_self on public.push_preferences;
create policy push_preferences_select_self on public.push_preferences
  for select using (auth.uid() = user_id);

drop policy if exists push_preferences_insert_self on public.push_preferences;
create policy push_preferences_insert_self on public.push_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists push_preferences_update_self on public.push_preferences;
create policy push_preferences_update_self on public.push_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_preferences_delete_self on public.push_preferences;
create policy push_preferences_delete_self on public.push_preferences
  for delete using (auth.uid() = user_id);
