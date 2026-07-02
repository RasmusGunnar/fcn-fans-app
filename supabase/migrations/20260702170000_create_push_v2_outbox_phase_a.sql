-- Notification Engine v2 Phase A
-- Passive outbox infrastructure. This migration does not change the legacy
-- push_tokens / notifications_log pipeline and does not enqueue or send pushes.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null unique,
  platform text not null,
  app_version text null,
  build_number text null,
  device_name text null,
  expo_project_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  invalidated_at timestamptz null,
  invalidated_reason text null,
  constraint push_devices_platform_check check (platform in ('ios', 'android')),
  constraint push_devices_token_not_blank check (length(btrim(push_token)) > 0)
);

create index if not exists push_devices_user_id_idx
  on public.push_devices (user_id);

create index if not exists push_devices_platform_idx
  on public.push_devices (platform);

create index if not exists push_devices_invalidated_at_idx
  on public.push_devices (invalidated_at);

create index if not exists push_devices_active_user_seen_idx
  on public.push_devices (user_id, last_seen_at desc)
  where invalidated_at is null;

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  notification_type text not null,
  preference_key text null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  source_table text null,
  source_id uuid null,
  dedupe_key text not null unique,
  status text not null default 'queued',
  skip_reason text null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  last_error_code text null,
  last_error_message text null,
  last_error_details jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_jobs_type_check check (
    notification_type in (
      'manual_test',
      'mention_post',
      'mention_comment',
      'mention_reply',
      'comment_on_post',
      'reply_to_comment',
      'community_post',
      'community_poll',
      'hot_post',
      'match_checkin_reminder',
      'event_reminder',
      'fan_activity_registration_confirmed',
      'fan_activity_registration_payment_missing',
      'media_digest'
    )
  ),
  constraint notification_jobs_preference_key_check check (
    preference_key is null
    or preference_key in (
      'mentions',
      'replies',
      'community_activity',
      'matchday_checkin',
      'event_reminders',
      'hot_posts',
      'media_digest'
    )
  ),
  constraint notification_jobs_status_check check (
    status in ('queued', 'processing', 'sent_to_expo', 'delivered', 'failed', 'skipped')
  ),
  constraint notification_jobs_title_not_blank check (length(btrim(title)) > 0),
  constraint notification_jobs_body_not_blank check (length(btrim(body)) > 0),
  constraint notification_jobs_dedupe_not_blank check (length(btrim(dedupe_key)) > 0),
  constraint notification_jobs_attempts_check check (
    attempt_count >= 0
    and max_attempts between 1 and 20
    and attempt_count <= max_attempts
  )
);

create index if not exists notification_jobs_queue_idx
  on public.notification_jobs (status, next_attempt_at, created_at);

create index if not exists notification_jobs_user_created_idx
  on public.notification_jobs (recipient_user_id, created_at desc);

create index if not exists notification_jobs_type_created_idx
  on public.notification_jobs (notification_type, created_at desc);

create index if not exists notification_jobs_source_idx
  on public.notification_jobs (source_table, source_id);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.notification_jobs(id) on delete cascade,
  device_id uuid null references public.push_devices(id) on delete set null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  push_token_snapshot text not null,
  platform text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  expo_ticket_id text null,
  expo_ticket_status text null,
  expo_receipt_status text null,
  expo_error_code text null,
  expo_error_message text null,
  expo_response jsonb null,
  sent_to_expo_at timestamptz null,
  receipt_checked_at timestamptz null,
  delivered_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_platform_check check (platform in ('ios', 'android')),
  constraint notification_deliveries_status_check check (
    status in ('queued', 'processing', 'sent_to_expo', 'delivered', 'failed', 'skipped')
  ),
  constraint notification_deliveries_token_not_blank check (length(btrim(push_token_snapshot)) > 0),
  constraint notification_deliveries_attempt_count_check check (attempt_count >= 0),
  constraint notification_deliveries_job_device_uidx unique (job_id, device_id)
);

create index if not exists notification_deliveries_job_idx
  on public.notification_deliveries (job_id);

create index if not exists notification_deliveries_receipt_idx
  on public.notification_deliveries (status, expo_ticket_id)
  where expo_ticket_id is not null;

create unique index if not exists notification_deliveries_ticket_uidx
  on public.notification_deliveries (expo_ticket_id)
  where expo_ticket_id is not null;

create index if not exists notification_deliveries_user_created_idx
  on public.notification_deliveries (recipient_user_id, created_at desc);

create index if not exists notification_deliveries_error_idx
  on public.notification_deliveries (expo_error_code, failed_at desc)
  where expo_error_code is not null;

create table if not exists public.notification_digest_runs (
  id uuid primary key default gen_random_uuid(),
  digest_type text not null,
  cph_day date not null,
  status text not null default 'processing',
  article_count integer not null default 0,
  jobs_enqueued integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_digest_runs_type_check check (
    digest_type in ('media_digest')
  ),
  constraint notification_digest_runs_status_check check (
    status in ('processing', 'completed', 'skipped', 'failed')
  ),
  constraint notification_digest_runs_counts_check check (
    article_count >= 0
    and jobs_enqueued >= 0
  ),
  constraint notification_digest_runs_type_day_uidx unique (digest_type, cph_day)
);

create index if not exists notification_digest_runs_status_idx
  on public.notification_digest_runs (status, cph_day desc);

create or replace function public.set_push_v2_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_push_devices_updated_at on public.push_devices;
create trigger set_push_devices_updated_at
before update on public.push_devices
for each row execute function public.set_push_v2_updated_at();

drop trigger if exists set_notification_jobs_updated_at on public.notification_jobs;
create trigger set_notification_jobs_updated_at
before update on public.notification_jobs
for each row execute function public.set_push_v2_updated_at();

drop trigger if exists set_notification_deliveries_updated_at on public.notification_deliveries;
create trigger set_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row execute function public.set_push_v2_updated_at();

drop trigger if exists set_notification_digest_runs_updated_at on public.notification_digest_runs;
create trigger set_notification_digest_runs_updated_at
before update on public.notification_digest_runs
for each row execute function public.set_push_v2_updated_at();

alter table public.push_devices enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_digest_runs enable row level security;

revoke all on public.push_devices from anon, authenticated;
revoke all on public.notification_jobs from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;
revoke all on public.notification_digest_runs from anon, authenticated;

grant select on public.push_devices to authenticated;
grant select on public.notification_jobs to authenticated;
grant select on public.notification_deliveries to authenticated;
grant select on public.notification_digest_runs to authenticated;

drop policy if exists "push devices read own or app admin" on public.push_devices;
drop policy if exists "push devices app admins read all" on public.push_devices;
create policy "push devices app admins read all"
on public.push_devices
for select
to authenticated
using (public.is_app_admin());

drop policy if exists "notification jobs app admins read all" on public.notification_jobs;
create policy "notification jobs app admins read all"
on public.notification_jobs
for select
to authenticated
using (public.is_app_admin());

drop policy if exists "notification deliveries app admins read all" on public.notification_deliveries;
create policy "notification deliveries app admins read all"
on public.notification_deliveries
for select
to authenticated
using (public.is_app_admin());

drop policy if exists "notification digest runs app admins read all" on public.notification_digest_runs;
create policy "notification digest runs app admins read all"
on public.notification_digest_runs
for select
to authenticated
using (public.is_app_admin());

create or replace function public.enqueue_notification(
  p_recipient_user_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_dedupe_key text,
  p_data jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null,
  p_preference_key text default null,
  p_source_table text default null,
  p_source_id uuid default null,
  p_next_attempt_at timestamptz default now(),
  p_max_attempts integer default 5
)
returns table (
  job_id uuid,
  inserted boolean,
  job_status text,
  skip_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_existing_status text;
  v_existing_skip_reason text;
  v_dedupe_key text := nullif(btrim(p_dedupe_key), '');
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_notification_type), '') is null then
    raise exception 'notification_type is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'title is required' using errcode = '22023';
  end if;

  if nullif(btrim(p_body), '') is null then
    raise exception 'body is required' using errcode = '22023';
  end if;

  if v_dedupe_key is null then
    raise exception 'dedupe_key is required' using errcode = '22023';
  end if;

  insert into public.notification_jobs (
    recipient_user_id,
    actor_user_id,
    notification_type,
    preference_key,
    title,
    body,
    data,
    source_table,
    source_id,
    dedupe_key,
    next_attempt_at,
    max_attempts
  )
  values (
    p_recipient_user_id,
    p_actor_user_id,
    btrim(p_notification_type),
    nullif(btrim(p_preference_key), ''),
    btrim(p_title),
    btrim(p_body),
    coalesce(p_data, '{}'::jsonb),
    nullif(btrim(p_source_table), ''),
    p_source_id,
    v_dedupe_key,
    coalesce(p_next_attempt_at, now()),
    coalesce(p_max_attempts, 5)
  )
  on conflict (dedupe_key) do nothing
  returning id into v_job_id;

  if v_job_id is not null then
    return query select v_job_id, true, 'queued'::text, null::text;
    return;
  end if;

  select id, status, notification_jobs.skip_reason
  into v_job_id, v_existing_status, v_existing_skip_reason
  from public.notification_jobs
  where notification_jobs.dedupe_key = v_dedupe_key
  limit 1;

  return query select v_job_id, false, v_existing_status, v_existing_skip_reason;
end;
$$;

revoke all on function public.enqueue_notification(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  integer
) from public;

revoke all on function public.enqueue_notification(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  integer
) from anon;

revoke all on function public.enqueue_notification(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  integer
) from authenticated;

grant execute on function public.enqueue_notification(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  integer
) to service_role;

revoke all on function public.set_push_v2_updated_at() from public;
revoke all on function public.set_push_v2_updated_at() from anon;
revoke all on function public.set_push_v2_updated_at() from authenticated;

insert into public.push_devices (
  user_id,
  push_token,
  platform,
  created_at,
  updated_at,
  last_seen_at
)
select
  user_id,
  push_token,
  platform,
  created_at,
  updated_at,
  coalesce(updated_at, created_at, now())
from public.push_tokens
where push_token is not null
  and length(btrim(push_token)) > 0
  and platform in ('ios', 'android')
on conflict (push_token) do update
set
  user_id = excluded.user_id,
  platform = excluded.platform,
  updated_at = greatest(public.push_devices.updated_at, excluded.updated_at),
  last_seen_at = greatest(public.push_devices.last_seen_at, excluded.last_seen_at),
  invalidated_at = null,
  invalidated_reason = null;

create or replace view public.v_push_v2_device_summary
with (security_invoker = true)
as
select
  platform,
  count(*) as total_devices,
  count(*) filter (where invalidated_at is null) as active_devices,
  count(*) filter (where invalidated_at is not null) as invalidated_devices,
  max(last_seen_at) as latest_seen_at
from public.push_devices
where public.is_app_admin()
group by platform;

create or replace view public.v_push_v2_job_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at) as day,
  notification_type,
  status,
  count(*) as job_count,
  max(created_at) as latest_created_at
from public.notification_jobs
where public.is_app_admin()
group by 1, notification_type, status;

create or replace view public.v_push_v2_delivery_errors
with (security_invoker = true)
as
select
  d.id,
  d.job_id,
  d.recipient_user_id,
  j.notification_type,
  d.platform,
  left(d.push_token_snapshot, 18) || '...' || right(d.push_token_snapshot, 8) as token_preview,
  d.status,
  d.expo_error_code,
  d.expo_error_message,
  d.failed_at,
  d.created_at
from public.notification_deliveries d
join public.notification_jobs j on j.id = d.job_id
where public.is_app_admin()
  and d.status = 'failed';

grant select on public.v_push_v2_device_summary to authenticated;
grant select on public.v_push_v2_job_summary to authenticated;
grant select on public.v_push_v2_delivery_errors to authenticated;

comment on table public.push_devices is
  'Notification Engine v2 canonical device registry. Phase A dual-writes from claim_push_token.';

comment on table public.notification_jobs is
  'Notification Engine v2 durable push outbox. Existing push functions are not converted in Phase A.';

comment on table public.notification_deliveries is
  'Notification Engine v2 per-device delivery ledger for Expo tickets and receipts.';

comment on table public.notification_digest_runs is
  'Notification Engine v2 digest run ledger, initially reserved for FCN i medierne daily digest.';

comment on function public.enqueue_notification(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  integer
) is
  'Internal Notification Engine v2 helper. Inserts one deduped notification_jobs row and returns existing row metadata on duplicate.';
