-- Per-user discussion read state with set-based unread counts.

create table if not exists public.discussion_thread_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.discussion_threads(id) on delete cascade,
  last_seen_at timestamptz not null,
  last_seen_post_id uuid references public.discussion_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create index if not exists discussion_thread_reads_thread_idx
  on public.discussion_thread_reads (thread_id, user_id);

alter table public.discussion_thread_reads enable row level security;

drop policy if exists discussion_thread_reads_select_self on public.discussion_thread_reads;
create policy discussion_thread_reads_select_self
  on public.discussion_thread_reads for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists discussion_thread_reads_insert_self on public.discussion_thread_reads;
create policy discussion_thread_reads_insert_self
  on public.discussion_thread_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists discussion_thread_reads_update_self on public.discussion_thread_reads;
create policy discussion_thread_reads_update_self
  on public.discussion_thread_reads for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists discussion_thread_reads_delete_self on public.discussion_thread_reads;
create policy discussion_thread_reads_delete_self
  on public.discussion_thread_reads for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.discussion_thread_reads to authenticated;

drop trigger if exists discussion_thread_reads_set_updated_at on public.discussion_thread_reads;
create trigger discussion_thread_reads_set_updated_at
before update on public.discussion_thread_reads
for each row execute function public.discussion_set_updated_at();

create or replace function public.get_discussion_threads_with_unread()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  is_pinned boolean,
  is_locked boolean,
  reply_count integer,
  last_post_at timestamptz,
  created_at timestamptz,
  unread_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible_threads as (
    select thread.*
    from public.discussion_threads thread
    where thread.deleted_at is null
      and auth.uid() is not null
  ),
  visible_posts as (
    select post.id, post.thread_id, post.author_id, post.created_at
    from public.discussion_posts post
    join visible_threads thread on thread.id = post.thread_id
    where post.deleted_at is null
      and post.hidden_at is null
  ),
  first_visible_post as (
    select distinct on (post.thread_id)
      post.thread_id,
      post.id as first_post_id
    from visible_posts post
    order by post.thread_id, post.created_at asc, post.id asc
  ),
  unread_by_thread as (
    select
      post.thread_id,
      count(*)::integer as unread_count
    from visible_posts post
    join first_visible_post first_post on first_post.thread_id = post.thread_id
    left join public.discussion_thread_reads read_state
      on read_state.thread_id = post.thread_id
     and read_state.user_id = auth.uid()
    where post.author_id <> auth.uid()
      and post.id <> first_post.first_post_id
      and (
        read_state.user_id is null
        or post.created_at > read_state.last_seen_at
        or (
          post.created_at = read_state.last_seen_at
          and read_state.last_seen_post_id is not null
          and post.id > read_state.last_seen_post_id
        )
      )
    group by post.thread_id
  )
  select
    thread.id,
    thread.slug,
    thread.title,
    thread.description,
    thread.is_pinned,
    thread.is_locked,
    thread.reply_count,
    thread.last_post_at,
    thread.created_at,
    coalesce(unread.unread_count, 0)::integer
  from visible_threads thread
  left join unread_by_thread unread on unread.thread_id = thread.id
  order by thread.is_pinned desc, thread.last_post_at desc nulls last, thread.created_at desc;
$$;

create or replace function public.mark_discussion_thread_read(
  p_thread_id uuid,
  p_last_seen_post_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seen_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select post.created_at
  into v_seen_at
  from public.discussion_posts post
  join public.discussion_threads thread on thread.id = post.thread_id
  where post.id = p_last_seen_post_id
    and post.thread_id = p_thread_id
    and post.deleted_at is null
    and post.hidden_at is null
    and thread.deleted_at is null;

  if v_seen_at is null then
    raise exception 'visible discussion post not found' using errcode = 'P0002';
  end if;

  insert into public.discussion_thread_reads (
    user_id,
    thread_id,
    last_seen_at,
    last_seen_post_id
  )
  values (
    v_user_id,
    p_thread_id,
    v_seen_at,
    p_last_seen_post_id
  )
  on conflict (user_id, thread_id) do update
  set
    last_seen_at = excluded.last_seen_at,
    last_seen_post_id = excluded.last_seen_post_id,
    updated_at = now()
  where
    excluded.last_seen_at > discussion_thread_reads.last_seen_at
    or (
      excluded.last_seen_at = discussion_thread_reads.last_seen_at
      and excluded.last_seen_post_id > coalesce(
        discussion_thread_reads.last_seen_post_id,
        '00000000-0000-0000-0000-000000000000'::uuid
      )
    );
end;
$$;

revoke all on function public.get_discussion_threads_with_unread() from public, anon;
grant execute on function public.get_discussion_threads_with_unread() to authenticated;

revoke all on function public.mark_discussion_thread_read(uuid, uuid) from public, anon;
grant execute on function public.mark_discussion_thread_read(uuid, uuid) to authenticated;

comment on function public.get_discussion_threads_with_unread() is
  'Returns visible discussion threads with unread visible posts by other users; the first post in a never-opened thread is excluded.';

comment on function public.mark_discussion_thread_read(uuid, uuid) is
  'Advances read state only through the latest post the client actually loaded.';
