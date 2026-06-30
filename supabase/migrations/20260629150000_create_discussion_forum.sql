-- Debat mini-forum under Bibliotek.
-- Creates isolated discussion tables, private storage bucket, RLS, moderation helpers,
-- and the first pinned thread without touching existing feed comments or score flows.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'discussion-media',
  'discussion-media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.discussion_threads (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  pinned_at timestamptz,
  locked_at timestamptz,
  last_post_at timestamptz,
  last_post_id uuid,
  reply_count integer not null default 0 check (reply_count >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discussion_threads_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$')
);

create table if not exists public.discussion_link_previews (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  normalized_url text not null,
  resolved_url text,
  domain text,
  title text,
  description text,
  image_url text,
  status text not null default 'ready',
  error_message text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discussion_link_previews_status_check
    check (status in ('ready', 'failed')),
  constraint discussion_link_previews_url_scheme
    check (url ~* '^https?://')
);

create unique index if not exists discussion_link_previews_url_key
  on public.discussion_link_previews (normalized_url);

create table if not exists public.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.discussion_threads(id) on delete cascade,
  parent_post_id uuid references public.discussion_posts(id) on delete set null,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  link_preview_id uuid references public.discussion_link_previews(id) on delete set null,
  hidden_at timestamptz,
  hidden_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  moderation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint discussion_posts_body_length check (
    char_length(btrim(body)) between 1 and 4000
  )
);

alter table public.discussion_threads
  drop constraint if exists discussion_threads_last_post_id_fkey;

alter table public.discussion_threads
  add constraint discussion_threads_last_post_id_fkey
  foreign key (last_post_id) references public.discussion_posts(id) on delete set null;

create table if not exists public.discussion_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'discussion-media',
  storage_path text not null,
  thumbnail_path text,
  media_type text not null,
  mime_type text,
  width integer,
  height integer,
  duration_ms integer,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint discussion_post_media_bucket_check check (bucket = 'discussion-media'),
  constraint discussion_post_media_type_check check (media_type in ('image', 'video')),
  constraint discussion_post_media_sort_order_check check (sort_order between 0 and 3),
  constraint discussion_post_media_size_check check (size_bytes is null or size_bytes between 1 and 52428800),
  constraint discussion_post_media_duration_check check (duration_ms is null or duration_ms <= 60000),
  constraint discussion_post_media_storage_path_owner check (storage_path !~ '(^/|\\.\\.)')
);

create table if not exists public.discussion_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null default 'like',
  created_at timestamptz not null default now(),
  constraint discussion_reactions_type_check check (reaction_type = 'like'),
  constraint discussion_reactions_unique unique (post_id, user_id, reaction_type)
);

create table if not exists public.discussion_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discussion_reports_reason_check
    check (reason in ('spam', 'abuse', 'harassment', 'personal_info', 'other')),
  constraint discussion_reports_status_check
    check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  constraint discussion_reports_unique_open_report unique (post_id, reporter_user_id)
);

create table if not exists public.discussion_user_moderation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  reason text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discussion_user_moderation_status_check
    check (status in ('timed_out', 'blocked')),
  constraint discussion_user_moderation_window_check
    check (expires_at is null or expires_at > starts_at)
);

create index if not exists discussion_threads_pinned_activity_idx
  on public.discussion_threads (is_pinned desc, last_post_at desc nulls last, created_at desc)
  where deleted_at is null;
create index if not exists discussion_posts_thread_created_idx
  on public.discussion_posts (thread_id, created_at desc);
create index if not exists discussion_posts_parent_created_idx
  on public.discussion_posts (parent_post_id, created_at asc)
  where parent_post_id is not null;
create index if not exists discussion_posts_author_created_idx
  on public.discussion_posts (author_id, created_at desc);
create index if not exists discussion_posts_moderation_idx
  on public.discussion_posts (hidden_at, deleted_at, created_at desc);
create index if not exists discussion_post_media_post_order_idx
  on public.discussion_post_media (post_id, sort_order);
create unique index if not exists discussion_post_media_storage_path_key
  on public.discussion_post_media (bucket, storage_path);
create index if not exists discussion_reactions_post_idx
  on public.discussion_reactions (post_id, created_at desc);
create index if not exists discussion_reports_status_created_idx
  on public.discussion_reports (status, created_at desc);
create index if not exists discussion_user_moderation_active_idx
  on public.discussion_user_moderation (user_id, status, starts_at desc);

create or replace function public.discussion_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.discussion_user_can_post(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.discussion_user_moderation moderation
    where moderation.user_id = p_user_id
      and moderation.status in ('timed_out', 'blocked')
      and moderation.starts_at <= now()
      and (moderation.expires_at is null or moderation.expires_at > now())
  );
$$;

create or replace function public.discussion_can_create_post(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.discussion_user_can_post(auth.uid())
    and exists (
      select 1
      from public.discussion_threads thread
      where thread.id = p_thread_id
        and thread.deleted_at is null
        and thread.is_locked = false
    )
    and (
      select count(*)
      from public.discussion_posts recent
      where recent.author_id = auth.uid()
        and recent.created_at > now() - interval '60 seconds'
    ) < 3
    and (
      select count(*)
      from public.discussion_posts recent
      where recent.author_id = auth.uid()
        and recent.created_at > now() - interval '10 minutes'
    ) < 20;
$$;

create or replace function public.discussion_validate_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_record record;
begin
  if char_length(btrim(new.body)) = 0 then
    raise exception 'discussion post body cannot be empty';
  end if;

  if new.parent_post_id is not null then
    select thread_id, parent_post_id
      into parent_record
      from public.discussion_posts
      where id = new.parent_post_id;

    if not found then
      raise exception 'discussion parent post does not exist';
    end if;

    if parent_record.thread_id <> new.thread_id then
      raise exception 'discussion reply parent must be in same thread';
    end if;

    if parent_record.parent_post_id is not null then
      raise exception 'discussion replies are limited to one nesting level';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if public.is_app_admin() = false then
      new.id = old.id;
      new.thread_id = old.thread_id;
      new.parent_post_id = old.parent_post_id;
      new.author_id = old.author_id;
      new.created_at = old.created_at;
      new.hidden_at = old.hidden_at;
      new.hidden_by = old.hidden_by;
      new.moderation_reason = old.moderation_reason;
    end if;

    new.updated_at = now();

    if new.body is distinct from old.body then
      new.edited_at = now();
    end if;

    if old.deleted_at is null and new.deleted_at is not null and new.deleted_by is null then
      new.deleted_by = auth.uid();
    end if;

    if old.hidden_at is null and new.hidden_at is not null and new.hidden_by is null then
      new.hidden_by = auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.discussion_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_thread_id uuid;
begin
  affected_thread_id := coalesce(new.thread_id, old.thread_id);

  update public.discussion_threads thread
     set reply_count = (
           select count(*)::integer
           from public.discussion_posts post
           where post.thread_id = affected_thread_id
             and post.deleted_at is null
             and post.hidden_at is null
         ),
         last_post_at = (
           select max(post.created_at)
           from public.discussion_posts post
           where post.thread_id = affected_thread_id
             and post.deleted_at is null
             and post.hidden_at is null
         ),
         last_post_id = (
           select post.id
           from public.discussion_posts post
           where post.thread_id = affected_thread_id
             and post.deleted_at is null
             and post.hidden_at is null
           order by post.created_at desc
           limit 1
         ),
         updated_at = now()
   where thread.id = affected_thread_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.discussion_validate_media_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  image_count integer;
  video_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.post_id::text, 0));

  select
    count(*) filter (where media_type = 'image'),
    count(*) filter (where media_type = 'video')
  into image_count, video_count
  from public.discussion_post_media
  where post_id = new.post_id;

  if image_count > 4 then
    raise exception 'discussion posts can have at most 4 images';
  end if;

  if video_count > 1 then
    raise exception 'discussion posts can have at most 1 video';
  end if;

  if image_count > 0 and video_count > 0 then
    raise exception 'discussion posts cannot mix images and video';
  end if;

  return new;
end;
$$;

drop trigger if exists discussion_threads_set_updated_at on public.discussion_threads;
create trigger discussion_threads_set_updated_at
  before update on public.discussion_threads
  for each row execute function public.discussion_set_updated_at();

drop trigger if exists discussion_link_previews_set_updated_at on public.discussion_link_previews;
create trigger discussion_link_previews_set_updated_at
  before update on public.discussion_link_previews
  for each row execute function public.discussion_set_updated_at();

drop trigger if exists discussion_posts_validate on public.discussion_posts;
create trigger discussion_posts_validate
  before insert or update on public.discussion_posts
  for each row execute function public.discussion_validate_post();

drop trigger if exists discussion_posts_touch_thread on public.discussion_posts;
create trigger discussion_posts_touch_thread
  after insert or update of hidden_at, deleted_at, created_at on public.discussion_posts
  for each row execute function public.discussion_touch_thread();

drop trigger if exists discussion_post_media_validate_limits on public.discussion_post_media;
create trigger discussion_post_media_validate_limits
  after insert or update on public.discussion_post_media
  for each row execute function public.discussion_validate_media_limits();

drop trigger if exists discussion_reports_set_updated_at on public.discussion_reports;
create trigger discussion_reports_set_updated_at
  before update on public.discussion_reports
  for each row execute function public.discussion_set_updated_at();

drop trigger if exists discussion_user_moderation_set_updated_at on public.discussion_user_moderation;
create trigger discussion_user_moderation_set_updated_at
  before update on public.discussion_user_moderation
  for each row execute function public.discussion_set_updated_at();

alter table public.discussion_threads enable row level security;
alter table public.discussion_posts enable row level security;
alter table public.discussion_post_media enable row level security;
alter table public.discussion_link_previews enable row level security;
alter table public.discussion_reactions enable row level security;
alter table public.discussion_reports enable row level security;
alter table public.discussion_user_moderation enable row level security;

drop policy if exists "discussion threads read visible" on public.discussion_threads;
create policy "discussion threads read visible"
  on public.discussion_threads for select
  using (deleted_at is null and auth.role() = 'authenticated');

drop policy if exists "discussion threads admin insert" on public.discussion_threads;
create policy "discussion threads admin insert"
  on public.discussion_threads for insert
  with check (public.is_app_admin());

drop policy if exists "discussion threads admin update" on public.discussion_threads;
create policy "discussion threads admin update"
  on public.discussion_threads for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "discussion threads admin delete" on public.discussion_threads;
create policy "discussion threads admin delete"
  on public.discussion_threads for delete
  using (public.is_app_admin());

drop policy if exists "discussion posts read visible" on public.discussion_posts;
create policy "discussion posts read visible"
  on public.discussion_posts for select
  using (
    auth.role() = 'authenticated'
    and (
      (deleted_at is null and hidden_at is null)
      or public.is_app_admin()
    )
  );

drop policy if exists "discussion posts insert own" on public.discussion_posts;
create policy "discussion posts insert own"
  on public.discussion_posts for insert
  with check (
    auth.uid() = author_id
    and public.discussion_can_create_post(thread_id)
  );

drop policy if exists "discussion posts update own within edit window" on public.discussion_posts;
create policy "discussion posts update own within edit window"
  on public.discussion_posts for update
  using (
    auth.uid() = author_id
    and hidden_at is null
    and deleted_at is null
    and created_at >= now() - interval '15 minutes'
  )
  with check (
    auth.uid() = author_id
    and hidden_at is null
    and created_at >= now() - interval '15 minutes'
    and (deleted_at is null or deleted_by = auth.uid())
  );

drop policy if exists "discussion posts admin update" on public.discussion_posts;
create policy "discussion posts admin update"
  on public.discussion_posts for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "discussion posts admin delete" on public.discussion_posts;
create policy "discussion posts admin delete"
  on public.discussion_posts for delete
  using (public.is_app_admin());

drop policy if exists "discussion media read visible" on public.discussion_post_media;
create policy "discussion media read visible"
  on public.discussion_post_media for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.discussion_posts post
      where post.id = discussion_post_media.post_id
        and (
          (post.deleted_at is null and post.hidden_at is null)
          or public.is_app_admin()
        )
    )
  );

drop policy if exists "discussion media insert own" on public.discussion_post_media;
create policy "discussion media insert own"
  on public.discussion_post_media for insert
  with check (
    auth.uid() = author_id
    and bucket = 'discussion-media'
    and storage_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.discussion_posts post
      where post.id = post_id
        and post.author_id = auth.uid()
        and post.deleted_at is null
        and post.hidden_at is null
    )
  );

drop policy if exists "discussion media delete own or admin" on public.discussion_post_media;
create policy "discussion media delete own or admin"
  on public.discussion_post_media for delete
  using (auth.uid() = author_id or public.is_app_admin());

drop policy if exists "discussion link previews read authenticated" on public.discussion_link_previews;
create policy "discussion link previews read authenticated"
  on public.discussion_link_previews for select
  using (auth.role() = 'authenticated');

drop policy if exists "discussion link previews admin write" on public.discussion_link_previews;
create policy "discussion link previews admin write"
  on public.discussion_link_previews for all
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "discussion reactions read visible" on public.discussion_reactions;
create policy "discussion reactions read visible"
  on public.discussion_reactions for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.discussion_posts post
      where post.id = discussion_reactions.post_id
        and post.deleted_at is null
        and post.hidden_at is null
    )
  );

drop policy if exists "discussion reactions insert own" on public.discussion_reactions;
create policy "discussion reactions insert own"
  on public.discussion_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.discussion_posts post
      where post.id = post_id
        and post.deleted_at is null
        and post.hidden_at is null
    )
  );

drop policy if exists "discussion reactions delete own" on public.discussion_reactions;
create policy "discussion reactions delete own"
  on public.discussion_reactions for delete
  using (auth.uid() = user_id or public.is_app_admin());

drop policy if exists "discussion reports read own or admin" on public.discussion_reports;
create policy "discussion reports read own or admin"
  on public.discussion_reports for select
  using (auth.uid() = reporter_user_id or public.is_app_admin());

drop policy if exists "discussion reports insert own" on public.discussion_reports;
create policy "discussion reports insert own"
  on public.discussion_reports for insert
  with check (
    auth.uid() = reporter_user_id
    and exists (
      select 1
      from public.discussion_posts post
      where post.id = post_id
        and post.deleted_at is null
        and post.hidden_at is null
    )
  );

drop policy if exists "discussion reports admin update" on public.discussion_reports;
create policy "discussion reports admin update"
  on public.discussion_reports for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "discussion moderation read own or admin" on public.discussion_user_moderation;
create policy "discussion moderation read own or admin"
  on public.discussion_user_moderation for select
  using (auth.uid() = user_id or public.is_app_admin());

drop policy if exists "discussion moderation admin insert" on public.discussion_user_moderation;
create policy "discussion moderation admin insert"
  on public.discussion_user_moderation for insert
  with check (public.is_app_admin());

drop policy if exists "discussion moderation admin update" on public.discussion_user_moderation;
create policy "discussion moderation admin update"
  on public.discussion_user_moderation for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "discussion moderation admin delete" on public.discussion_user_moderation;
create policy "discussion moderation admin delete"
  on public.discussion_user_moderation for delete
  using (public.is_app_admin());

do $$
begin
  begin
    execute 'alter table storage.objects enable row level security';
  exception when insufficient_privilege then
    raise notice 'No permission to alter storage.objects; continuing with discussion-media storage policy creation.';
  end;

  begin
    execute 'drop policy if exists "discussion media authenticated read" on storage.objects';
    execute 'create policy "discussion media authenticated read" on storage.objects
      for select using (
        bucket_id = ''discussion-media''
        and auth.role() = ''authenticated''
        and exists (
          select 1
          from public.discussion_post_media media
          join public.discussion_posts post on post.id = media.post_id
          where media.bucket = ''discussion-media''
            and (media.storage_path = storage.objects.name or media.thumbnail_path = storage.objects.name)
            and (
              (post.deleted_at is null and post.hidden_at is null)
              or public.is_app_admin()
            )
        )
      )';

    execute 'drop policy if exists "discussion media upload own folder" on storage.objects';
    execute 'create policy "discussion media upload own folder" on storage.objects
      for insert with check (
        bucket_id = ''discussion-media''
        and auth.role() = ''authenticated''
        and (storage.foldername(name))[1] = auth.uid()::text
      )';

    execute 'drop policy if exists "discussion media update own folder" on storage.objects';
    execute 'create policy "discussion media update own folder" on storage.objects
      for update using (
        bucket_id = ''discussion-media''
        and (
          (auth.role() = ''authenticated'' and (storage.foldername(name))[1] = auth.uid()::text)
          or public.is_app_admin()
        )
      ) with check (
        bucket_id = ''discussion-media''
        and (
          (auth.role() = ''authenticated'' and (storage.foldername(name))[1] = auth.uid()::text)
          or public.is_app_admin()
        )
      )';

    execute 'drop policy if exists "discussion media delete own folder" on storage.objects';
    execute 'create policy "discussion media delete own folder" on storage.objects
      for delete using (
        bucket_id = ''discussion-media''
        and (
          (auth.role() = ''authenticated'' and (storage.foldername(name))[1] = auth.uid()::text)
          or public.is_app_admin()
        )
      )';
  end;
end $$;

insert into public.discussion_threads (
  id,
  slug,
  title,
  description,
  is_pinned,
  pinned_at,
  created_at,
  updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  'fcn-fans-debatten',
  'FCN Fans-debatten',
  'Alt om FC Nordsjælland: kampe, transfers, rygter, taktik, tribunen og hverdagen omkring klubben.',
  true,
  now(),
  now(),
  now()
)
on conflict (slug) do update
  set title = excluded.title,
      description = excluded.description,
      is_pinned = true,
      pinned_at = coalesce(public.discussion_threads.pinned_at, excluded.pinned_at),
      deleted_at = null,
      updated_at = now();

grant select, insert, update, delete on public.discussion_threads to authenticated;
grant select, insert, update, delete on public.discussion_posts to authenticated;
grant select, insert, delete on public.discussion_post_media to authenticated;
grant select on public.discussion_link_previews to authenticated;
grant select, insert, delete on public.discussion_reactions to authenticated;
grant select, insert, update on public.discussion_reports to authenticated;
grant select, insert, update, delete on public.discussion_user_moderation to authenticated;
grant execute on function public.discussion_user_can_post(uuid) to authenticated;
grant execute on function public.discussion_can_create_post(uuid) to authenticated;
