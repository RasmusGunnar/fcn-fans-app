create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid not null,
  type text not null check (type in ('mention', 'reply')),
  entity_type text not null check (entity_type in ('post', 'comment')),
  entity_id uuid not null,
  post_id uuid not null,
  read boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self on public.notifications
for select using (auth.uid() = user_id);

drop policy if exists notifications_insert_actor on public.notifications;
create policy notifications_insert_actor on public.notifications
for insert with check (auth.uid() = actor_id);

drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);
