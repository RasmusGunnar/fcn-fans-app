create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select_self on public.push_tokens;
create policy push_tokens_select_self on public.push_tokens
for select using (auth.uid() = user_id);

drop policy if exists push_tokens_insert_self on public.push_tokens;
create policy push_tokens_insert_self on public.push_tokens
for insert with check (auth.uid() = user_id);

drop policy if exists push_tokens_update_self on public.push_tokens;
create policy push_tokens_update_self on public.push_tokens
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists push_tokens_delete_self on public.push_tokens;
create policy push_tokens_delete_self on public.push_tokens
for delete using (auth.uid() = user_id);

create table if not exists public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  push_token text not null,
  notification_type text not null,
  dedupe_key text not null unique,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  sent_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_log_user_id_idx
  on public.notifications_log(user_id);

create index if not exists notifications_log_type_created_idx
  on public.notifications_log(notification_type, created_at desc);

alter table public.notifications_log enable row level security;

drop policy if exists notifications_log_select_self on public.notifications_log;
create policy notifications_log_select_self on public.notifications_log
for select using (auth.uid() = user_id);
