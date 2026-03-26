create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  post_id uuid references posts(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists hashtags_tag_idx on public.hashtags(tag);
create index if not exists hashtags_post_id_idx on public.hashtags(post_id);
