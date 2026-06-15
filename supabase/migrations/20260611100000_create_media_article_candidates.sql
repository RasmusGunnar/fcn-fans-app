create table if not exists public.media_article_candidates (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_name text not null,
  source_url text not null,
  canonical_url text not null,
  title text not null,
  description text,
  image_url text,
  caption text not null default '',
  published_at timestamp with time zone,
  detected_keywords text[] not null default '{}'::text[],
  relevance_score integer not null default 0,
  status text not null default 'pending',
  reviewed_at timestamp with time zone,
  reviewed_by uuid references auth.users(id) on delete set null,
  published_post_id uuid references public.posts(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint media_article_candidates_source_url_check
    check (btrim(source_url) ~* '^https?://[^[:space:]]+$'),
  constraint media_article_candidates_canonical_url_check
    check (btrim(canonical_url) ~* '^https?://[^[:space:]]+$'),
  constraint media_article_candidates_status_check
    check (status in ('pending', 'approved', 'rejected', 'ignored')),
  constraint media_article_candidates_relevance_score_check
    check (relevance_score between 0 and 100),
  constraint media_article_candidates_approved_post_check
    check (
      status = 'approved'
      or published_post_id is null
    )
);

create unique index if not exists media_article_candidates_canonical_url_uidx
  on public.media_article_candidates (canonical_url);

create index if not exists media_article_candidates_review_queue_idx
  on public.media_article_candidates (status, relevance_score desc, published_at desc);

create index if not exists media_article_candidates_created_at_idx
  on public.media_article_candidates (created_at desc);

alter table public.media_article_candidates enable row level security;

revoke all on table public.media_article_candidates from anon;
grant select, insert, update, delete on table public.media_article_candidates to authenticated;

drop policy if exists "app admins read media article candidates"
  on public.media_article_candidates;

create policy "app admins read media article candidates"
  on public.media_article_candidates
  for select
  to authenticated
  using (public.is_app_admin());

drop policy if exists "app admins create pending media article candidates"
  on public.media_article_candidates;

create policy "app admins create pending media article candidates"
  on public.media_article_candidates
  for insert
  to authenticated
  with check (
    public.is_app_admin()
    and status = 'pending'
    and published_post_id is null
  );

drop policy if exists "app admins update unapproved media article candidates"
  on public.media_article_candidates;

create policy "app admins update unapproved media article candidates"
  on public.media_article_candidates
  for update
  to authenticated
  using (public.is_app_admin())
  with check (
    public.is_app_admin()
    and status <> 'approved'
    and published_post_id is null
  );

drop policy if exists "app admins delete media article candidates"
  on public.media_article_candidates;

create policy "app admins delete media article candidates"
  on public.media_article_candidates
  for delete
  to authenticated
  using (public.is_app_admin());

create or replace function public.set_media_article_candidate_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();

  if new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_at = null;
      new.reviewed_by = null;
    else
      new.reviewed_at = now();
      new.reviewed_by = auth.uid();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_media_article_candidate_updated_at
  on public.media_article_candidates;

create trigger set_media_article_candidate_updated_at
before update on public.media_article_candidates
for each row
execute function public.set_media_article_candidate_updated_at();

create or replace function public.approve_media_article_candidate(
  p_candidate_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.media_article_candidates%rowtype;
  v_post_id uuid;
  v_link_preview jsonb;
begin
  if auth.uid() is null or not public.is_app_admin() then
    raise exception 'app admin required' using errcode = '42501';
  end if;

  select *
  into v_candidate
  from public.media_article_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'media article candidate not found' using errcode = 'P0002';
  end if;

  if v_candidate.status <> 'pending' then
    raise exception 'only pending media article candidates can be approved'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_candidate.canonical_url, 0));

  if exists (
    select 1
    from public.posts
    where post_type = 'media_article'
      and link_preview ->> 'url' = v_candidate.canonical_url
  ) then
    raise exception 'media article URL already published'
      using errcode = '23505';
  end if;

  v_link_preview := jsonb_strip_nulls(
    jsonb_build_object(
      'url', v_candidate.canonical_url,
      'title', nullif(btrim(v_candidate.title), ''),
      'description', nullif(btrim(coalesce(v_candidate.description, '')), ''),
      'imageUrl', nullif(btrim(coalesce(v_candidate.image_url, '')), ''),
      'siteName', nullif(btrim(v_candidate.source_name), '')
    )
  );

  insert into public.posts (
    author_id,
    actor_type,
    actor_id,
    post_type,
    text,
    media,
    link_preview,
    feed_targets
  )
  values (
    auth.uid(),
    'user',
    auth.uid(),
    'media_article',
    btrim(coalesce(v_candidate.caption, '')),
    '[]'::jsonb,
    v_link_preview,
    array['home']::text[]
  )
  returning id into v_post_id;

  update public.media_article_candidates
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    published_post_id = v_post_id
  where id = v_candidate.id;

  return v_post_id;
end;
$$;

revoke all on function public.approve_media_article_candidate(uuid) from public;
grant execute on function public.approve_media_article_candidate(uuid) to authenticated;

comment on table public.media_article_candidates is
  'Admin-only metadata review queue for discovered FCN media articles. Candidates never appear in public feeds.';

comment on function public.approve_media_article_candidate(uuid) is
  'Atomically approves a pending candidate and publishes it as a normal media_article post.';
