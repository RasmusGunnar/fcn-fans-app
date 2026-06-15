alter table public.posts
  add column if not exists actor_type text not null default 'user',
  add column if not exists actor_id uuid,
  add column if not exists community_id uuid references public.communities(id) on delete set null,
  add column if not exists feed_targets text[] not null default array['home']::text[];

update public.posts
set actor_id = author_id
where actor_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_actor_type_check'
  ) then
    alter table public.posts
      add constraint posts_actor_type_check
      check (actor_type in ('user', 'community'))
      not valid;
  end if;
end
$$;

alter table public.posts
  validate constraint posts_actor_type_check;

create index if not exists posts_feed_targets_gin_idx
  on public.posts
  using gin (feed_targets);
