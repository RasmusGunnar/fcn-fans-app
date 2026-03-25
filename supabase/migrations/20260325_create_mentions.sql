create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  mentioned_user_id uuid references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists mentions_mentioned_user_id_idx on public.mentions(mentioned_user_id);
create index if not exists mentions_post_id_idx on public.mentions(post_id);
