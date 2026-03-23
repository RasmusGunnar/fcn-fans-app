create table if not exists public.community_feed_items (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint community_feed_items_community_id_key unique (community_id)
);

create index if not exists idx_community_feed_items_created_at
  on public.community_feed_items (created_at desc);

alter table public.community_feed_items enable row level security;

drop policy if exists "community_feed_items_select_authenticated" on public.community_feed_items;
create policy "community_feed_items_select_authenticated"
  on public.community_feed_items
  for select
  to authenticated
  using (true);

drop policy if exists "community_feed_items_insert_self" on public.community_feed_items;
create policy "community_feed_items_insert_self"
  on public.community_feed_items
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
  );
