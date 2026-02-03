-- Adds community scope for posts (used when posting as a community)
alter table public.posts
  add column if not exists community_id uuid null;

create index if not exists posts_community_id_idx on public.posts (community_id);
