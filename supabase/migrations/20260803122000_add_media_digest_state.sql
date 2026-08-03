-- Durable media-digest run and article state. Scheduler activation is intentionally
-- isolated in 20260803123000_activate_media_digest_cron.sql.

alter table public.notification_digest_runs
  add column if not exists recipients_count integer not null default 0,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_article_created_at timestamptz,
  add column if not exists last_article_id uuid references public.posts(id) on delete set null;

alter table public.notification_digest_runs
  drop constraint if exists notification_digest_runs_recipient_count_check;

alter table public.notification_digest_runs
  add constraint notification_digest_runs_recipient_count_check
  check (recipients_count >= 0);

alter table public.notification_digest_runs
  drop constraint if exists notification_digest_runs_attempt_count_check;

alter table public.notification_digest_runs
  add constraint notification_digest_runs_attempt_count_check
  check (attempt_count >= 1);

create table if not exists public.notification_digest_articles (
  digest_run_id uuid not null references public.notification_digest_runs(id) on delete cascade,
  digest_type text not null default 'media_digest',
  article_id uuid not null references public.posts(id) on delete cascade,
  included_at timestamptz not null default now(),
  primary key (digest_run_id, article_id),
  constraint notification_digest_articles_type_check check (digest_type = 'media_digest'),
  constraint notification_digest_articles_once_uidx unique (digest_type, article_id)
);

create index if not exists notification_digest_articles_article_idx
  on public.notification_digest_articles (article_id);

alter table public.notification_digest_articles enable row level security;
revoke all on public.notification_digest_articles from anon, authenticated;
grant select on public.notification_digest_articles to authenticated;

drop policy if exists "notification digest articles app admins read all"
  on public.notification_digest_articles;
create policy "notification digest articles app admins read all"
  on public.notification_digest_articles
  for select
  to authenticated
  using (public.is_app_admin());

create or replace function public.complete_media_digest_run(
  p_run_id uuid,
  p_started_at timestamptz,
  p_article_ids uuid[],
  p_recipients_count integer,
  p_jobs_enqueued integer,
  p_last_article_created_at timestamptz,
  p_last_article_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_count integer := coalesce(cardinality(p_article_ids), 0);
begin
  if v_article_count < 1 then
    raise exception 'at least one article is required' using errcode = '22023';
  end if;
  if p_recipients_count < 0 or p_jobs_enqueued < 0 then
    raise exception 'digest counts cannot be negative' using errcode = '22023';
  end if;
  if p_last_article_created_at is null then
    raise exception 'last article timestamp is required' using errcode = '22023';
  end if;
  if p_last_article_id is null or not (p_last_article_id = any(p_article_ids)) then
    raise exception 'last article must be included in article ids' using errcode = '22023';
  end if;

  perform 1
  from public.notification_digest_runs run
  where run.id = p_run_id
    and run.digest_type = 'media_digest'
    and run.status = 'processing'
    and run.started_at = p_started_at
  for update;

  if not found then
    return false;
  end if;

  insert into public.notification_digest_articles (
    digest_run_id,
    digest_type,
    article_id
  )
  select
    p_run_id,
    'media_digest',
    article.selected_article_id
  from unnest(p_article_ids) as article(selected_article_id);

  update public.notification_digest_runs
  set
    status = 'completed',
    article_count = v_article_count,
    recipients_count = p_recipients_count,
    jobs_enqueued = p_jobs_enqueued,
    last_article_created_at = p_last_article_created_at,
    last_article_id = p_last_article_id,
    completed_at = now(),
    error_message = null
  where id = p_run_id;

  return true;
end;
$$;

revoke all on function public.complete_media_digest_run(
  uuid,
  timestamptz,
  uuid[],
  integer,
  integer,
  timestamptz,
  uuid
) from public, anon, authenticated;

grant execute on function public.complete_media_digest_run(
  uuid,
  timestamptz,
  uuid[],
  integer,
  integer,
  timestamptz,
  uuid
) to service_role;

comment on table public.notification_digest_articles is
  'Articles included in a successfully enqueued media digest; failed runs do not write rows here.';

comment on column public.notification_digest_runs.last_article_created_at is
  'Cursor from the newest article in a successfully enqueued digest; equal timestamps are rechecked against notification_digest_articles.';

comment on column public.notification_digest_runs.attempt_count is
  'Number of initial, failed-retry, or stale-reclaim attempts for the CPH-day run.';

comment on function public.complete_media_digest_run(
  uuid,
  timestamptz,
  uuid[],
  integer,
  integer,
  timestamptz,
  uuid
) is
  'Atomically records included articles and completes the currently leased media-digest run.';
