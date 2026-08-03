-- One unread source for notification center rows, app-icon badges, and v2 push payloads.

alter table public.push_preferences
  add column if not exists highfives_enabled boolean not null default true,
  add column if not exists media_digest_enabled boolean not null default true;

alter table public.notification_jobs
  drop constraint if exists notification_jobs_type_check;

alter table public.notification_jobs
  add constraint notification_jobs_type_check check (
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
      'match_highfive',
      'media_digest'
    )
  );

alter table public.notification_jobs
  drop constraint if exists notification_jobs_preference_key_check;

alter table public.notification_jobs
  add constraint notification_jobs_preference_key_check check (
    preference_key is null
    or preference_key in (
      'mentions',
      'replies',
      'community_activity',
      'matchday_checkin',
      'event_reminders',
      'hot_posts',
      'highfives',
      'media_digest'
    )
  );

alter table public.notifications
  alter column actor_id drop not null,
  alter column entity_type drop not null,
  alter column entity_id drop not null,
  alter column post_id drop not null,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists notification_job_id uuid references public.notification_jobs(id) on delete set null,
  add column if not exists dedupe_key text;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'mention',
      'reply',
      'community_post',
      'community_poll',
      'hot_post',
      'match_checkin_reminder',
      'event_reminder',
      'fan_activity_registration_confirmed',
      'fan_activity_registration_payment_missing',
      'match_highfive',
      'media_digest'
    )
  );

alter table public.notifications
  drop constraint if exists notifications_entity_type_check;

-- Client-generated notification rows remain limited to the existing mention/reply flows.
-- Service-role jobs and the security-definer trigger bypass this authenticated policy.
drop policy if exists notifications_insert_actor on public.notifications;
create policy notifications_insert_actor
  on public.notifications for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and user_id <> auth.uid()
    and type in ('mention', 'reply')
    and notification_job_id is null
    and dedupe_key is null
  );

create unique index if not exists notifications_job_uidx
  on public.notifications (notification_job_id)
  where notification_job_id is not null;

create unique index if not exists notifications_dedupe_uidx
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc)
  where read = false;

create or replace function public.create_notification_center_entry_from_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mention/reply flows already create their canonical legacy rows before enqueue.
  if new.notification_type in (
    'manual_test',
    'mention_post',
    'mention_comment',
    'mention_reply',
    'comment_on_post',
    'reply_to_comment'
  ) then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    post_id,
    title,
    body,
    data,
    notification_job_id,
    dedupe_key,
    read,
    created_at
  )
  values (
    new.recipient_user_id,
    new.actor_user_id,
    new.notification_type,
    nullif(btrim(new.data ->> 'targetType'), ''),
    new.source_id,
    case when new.source_table = 'posts' then new.source_id else null end,
    new.title,
    new.body,
    coalesce(new.data, '{}'::jsonb),
    new.id,
    new.dedupe_key,
    false,
    new.created_at
  )
  on conflict (notification_job_id) where notification_job_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists notification_jobs_create_center_entry on public.notification_jobs;
create trigger notification_jobs_create_center_entry
after insert on public.notification_jobs
for each row execute function public.create_notification_center_entry_from_job();

comment on function public.create_notification_center_entry_from_job() is
  'Mirrors user-visible Notification Engine v2 jobs into the existing unread notification center model.';
