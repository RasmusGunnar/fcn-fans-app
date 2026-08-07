-- Direct Messages V1: private 1:1 conversations, read state, moderation,
-- realtime, and transactional Notification Engine v2 outbox integration.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references public.profiles(id) on delete cascade,
  user_high_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_id uuid,
  constraint conversations_distinct_users_check check (user_low_id <> user_high_id),
  constraint conversations_canonical_pair_check check (user_low_id < user_high_id),
  constraint conversations_creator_participant_check check (
    created_by is null or created_by in (user_low_id, user_high_id)
  ),
  constraint conversations_direct_pair_unique unique (user_low_id, user_high_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  client_message_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint messages_body_length_check check (char_length(btrim(body)) between 1 and 2000),
  constraint messages_sender_client_unique unique (sender_id, client_message_id)
);

alter table public.conversations
  drop constraint if exists conversations_last_message_id_fkey;

alter table public.conversations
  add constraint conversations_last_message_id_fkey
  foreign key (last_message_id) references public.messages(id) on delete set null;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  last_read_message_id uuid references public.messages(id) on delete set null,
  archived_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_users_check check (blocker_id <> blocked_id)
);

create table if not exists public.direct_message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reason text not null,
  note text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint direct_message_reports_distinct_users_check check (reporter_id <> reported_user_id),
  constraint direct_message_reports_reason_check check (
    reason in ('spam', 'abuse', 'harassment', 'personal_info', 'other')
  ),
  constraint direct_message_reports_note_check check (
    note is null or char_length(btrim(note)) between 1 and 1000
  ),
  constraint direct_message_reports_status_check check (
    status in ('open', 'reviewed', 'dismissed', 'actioned')
  )
);

create index if not exists conversations_user_low_activity_idx
  on public.conversations (user_low_id, last_message_at desc, id desc);
create index if not exists conversations_user_high_activity_idx
  on public.conversations (user_high_id, last_message_at desc, id desc);
create index if not exists conversations_created_by_rate_idx
  on public.conversations (created_by, created_at desc)
  where created_by is not null;
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index if not exists conversation_members_user_activity_idx
  on public.conversation_members (user_id, archived_at, conversation_id);
create index if not exists user_blocks_blocked_blocker_idx
  on public.user_blocks (blocked_id, blocker_id);
create index if not exists direct_message_reports_status_created_idx
  on public.direct_message_reports (status, created_at desc);
create unique index if not exists direct_message_reports_open_pair_idx
  on public.direct_message_reports (conversation_id, reporter_id, reported_user_id)
  where status = 'open';
create index if not exists profiles_dm_username_search_idx
  on public.profiles (lower(username) text_pattern_ops)
  where username is not null;
create index if not exists profiles_dm_display_name_search_idx
  on public.profiles (lower(display_name) text_pattern_ops)
  where display_name is not null;

create or replace function public.direct_message_users_blocked(
  p_first_user_id uuid,
  p_second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks block_row
    where (block_row.blocker_id = p_first_user_id and block_row.blocked_id = p_second_user_id)
       or (block_row.blocker_id = p_second_user_id and block_row.blocked_id = p_first_user_id)
  );
$$;

create or replace function public.validate_direct_conversation_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_participant boolean;
begin
  select new.user_id in (conversation.user_low_id, conversation.user_high_id)
  into v_is_participant
  from public.conversations conversation
  where conversation.id = new.conversation_id;

  if coalesce(v_is_participant, false) = false then
    raise exception 'direct_message_invalid_member' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists conversation_members_validate_participant on public.conversation_members;
create trigger conversation_members_validate_participant
before insert or update on public.conversation_members
for each row execute function public.validate_direct_conversation_member();

create or replace function public.validate_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low_user_id uuid;
  v_high_user_id uuid;
begin
  select conversation.user_low_id, conversation.user_high_id
  into v_low_user_id, v_high_user_id
  from public.conversations conversation
  where conversation.id = new.conversation_id;

  if not found or new.sender_id not in (v_low_user_id, v_high_user_id) then
    raise exception 'direct_message_sender_not_participant' using errcode = '42501';
  end if;

  if public.direct_message_users_blocked(v_low_user_id, v_high_user_id) then
    raise exception 'direct_message_blocked' using errcode = '42501';
  end if;

  new.body := btrim(new.body);
  return new;
end;
$$;

drop trigger if exists messages_validate_direct_message on public.messages;
create trigger messages_validate_direct_message
before insert or update on public.messages
for each row execute function public.validate_direct_message();

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.direct_message_reports enable row level security;

drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant
  on public.conversations for select
  to authenticated
  using (auth.uid() in (user_low_id, user_high_id));

drop policy if exists conversation_members_select_conversation on public.conversation_members;
create policy conversation_members_select_conversation
  on public.conversation_members for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations conversation
      where conversation.id = conversation_members.conversation_id
        and auth.uid() in (conversation.user_low_id, conversation.user_high_id)
    )
  );

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations conversation
      where conversation.id = messages.conversation_id
        and auth.uid() in (conversation.user_low_id, conversation.user_high_id)
    )
  );

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
  on public.user_blocks for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists direct_message_reports_select_own_or_admin on public.direct_message_reports;
create policy direct_message_reports_select_own_or_admin
  on public.direct_message_reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_app_admin());

drop policy if exists direct_message_reports_admin_update on public.direct_message_reports;
create policy direct_message_reports_admin_update
  on public.direct_message_reports for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

revoke all on public.conversations from anon, authenticated;
revoke all on public.conversation_members from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.user_blocks from anon, authenticated;
revoke all on public.direct_message_reports from anon, authenticated;

grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select on public.messages to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, update on public.direct_message_reports to authenticated;

alter table public.push_preferences
  add column if not exists direct_messages_enabled boolean not null default true;

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
      'media_digest',
      'direct_message'
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
      'media_digest',
      'direct_messages'
    )
  );

create or replace function public.create_notification_center_entry_from_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- DM unread belongs to the separate message inbox and must not affect the bell.
  if new.notification_type in (
    'manual_test',
    'mention_post',
    'mention_comment',
    'mention_reply',
    'comment_on_post',
    'reply_to_comment',
    'direct_message'
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

create or replace function public.create_or_get_direct_conversation(
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_low_user_id uuid;
  v_high_user_id uuid;
  v_conversation_id uuid;
  v_recent_conversations integer;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'direct_message_self_conversation' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles profile where profile.id = p_other_user_id) then
    raise exception 'direct_message_user_not_found' using errcode = 'P0002';
  end if;

  if public.direct_message_users_blocked(v_user_id, p_other_user_id) then
    raise exception 'direct_message_blocked' using errcode = '42501';
  end if;

  v_low_user_id := least(v_user_id, p_other_user_id);
  v_high_user_id := greatest(v_user_id, p_other_user_id);

  select conversation.id
  into v_conversation_id
  from public.conversations conversation
  where conversation.user_low_id = v_low_user_id
    and conversation.user_high_id = v_high_user_id;

  if v_conversation_id is null then
    select count(*)::integer
    into v_recent_conversations
    from public.conversations conversation
    where conversation.created_by = v_user_id
      and conversation.created_at > now() - interval '10 minutes';

    if v_recent_conversations >= 10 then
      raise exception 'direct_message_conversation_rate_limited' using errcode = 'P0001';
    end if;

    insert into public.conversations (user_low_id, user_high_id, created_by)
    values (v_low_user_id, v_high_user_id, v_user_id)
    on conflict (user_low_id, user_high_id) do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select conversation.id
      into v_conversation_id
      from public.conversations conversation
      where conversation.user_low_id = v_low_user_id
        and conversation.user_high_id = v_high_user_id;
    end if;
  end if;

  delete from public.conversation_members member
  where member.conversation_id = v_conversation_id
    and member.user_id not in (v_low_user_id, v_high_user_id);

  insert into public.conversation_members (conversation_id, user_id)
  values
    (v_conversation_id, v_low_user_id),
    (v_conversation_id, v_high_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id uuid
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  notification_job_id uuid,
  inserted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_recipient_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_recent_messages integer;
  v_job_id uuid;
  v_push_enabled boolean := true;
  v_sender_name text;
  v_preview text;
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if p_client_message_id is null then
    raise exception 'direct_message_client_id_required' using errcode = '22023';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'direct_message_body_length' using errcode = '22023';
  end if;

  select message.*
  into v_message
  from public.messages message
  where message.sender_id = v_user_id
    and message.client_message_id = p_client_message_id;

  if found then
    select job.id
    into v_job_id
    from public.notification_jobs job
    where job.notification_type = 'direct_message'
      and job.source_table = 'messages'
      and job.source_id = v_message.id
    limit 1;

    return query select
      v_message.id,
      v_message.conversation_id,
      v_message.sender_id,
      v_message.body,
      v_message.created_at,
      v_job_id,
      false;
    return;
  end if;

  select conversation.*
  into v_conversation
  from public.conversations conversation
  where conversation.id = p_conversation_id
    and v_user_id in (conversation.user_low_id, conversation.user_high_id)
  for update;

  if not found then
    raise exception 'direct_message_conversation_not_found' using errcode = 'P0002';
  end if;

  v_recipient_id := case
    when v_user_id = v_conversation.user_low_id then v_conversation.user_high_id
    else v_conversation.user_low_id
  end;

  if public.direct_message_users_blocked(v_user_id, v_recipient_id) then
    raise exception 'direct_message_blocked' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_recent_messages
  from public.messages message
  where message.sender_id = v_user_id
    and message.created_at > now() - interval '1 minute';

  if v_recent_messages >= 30 then
    raise exception 'direct_message_send_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_id, client_message_id, body)
  values (p_conversation_id, v_user_id, p_client_message_id, v_body)
  on conflict on constraint messages_sender_client_unique do nothing
  returning * into v_message;

  if not found then
    select message.*
    into v_message
    from public.messages message
    where message.sender_id = v_user_id
      and message.client_message_id = p_client_message_id;
  else
    v_inserted := true;
  end if;

  if v_inserted then
    update public.conversations
    set
      last_message_id = v_message.id,
      last_message_at = v_message.created_at,
      updated_at = v_message.created_at
    where id = p_conversation_id;

    update public.conversation_members
    set archived_at = null
    where conversation_members.conversation_id = p_conversation_id;

    select preference.direct_messages_enabled
    into v_push_enabled
    from public.push_preferences preference
    where preference.user_id = v_recipient_id;

    v_push_enabled := coalesce(v_push_enabled, true);

    if v_push_enabled then
      select coalesce(
        nullif(btrim(profile.display_name), ''),
        nullif(btrim(profile.username), ''),
        'En FCN-fan'
      )
      into v_sender_name
      from public.profiles profile
      where profile.id = v_user_id;

      v_preview := left(regexp_replace(v_body, '[[:space:]]+', ' ', 'g'), 90);

      select enqueue_result.job_id
      into v_job_id
      from public.enqueue_notification(
        p_recipient_user_id => v_recipient_id,
        p_notification_type => 'direct_message',
        p_title => coalesce(v_sender_name, 'En FCN-fan'),
        p_body => coalesce(nullif(v_preview, ''), 'Du har fået en ny besked'),
        p_dedupe_key => 'direct_message:' || v_message.id::text || ':' || v_recipient_id::text,
        p_data => jsonb_build_object(
          'targetType', 'direct_message',
          'type', 'direct_message',
          'notificationType', 'direct_message',
          'conversationId', p_conversation_id,
          'messageId', v_message.id,
          'senderId', v_user_id,
          'url', 'fcnfans://messages/' || p_conversation_id::text
        ),
        p_actor_user_id => v_user_id,
        p_preference_key => 'direct_messages',
        p_source_table => 'messages',
        p_source_id => v_message.id,
        p_next_attempt_at => now(),
        p_max_attempts => 5
      ) enqueue_result
      limit 1;
    end if;
  else
    select job.id
    into v_job_id
    from public.notification_jobs job
    where job.notification_type = 'direct_message'
      and job.source_table = 'messages'
      and job.source_id = v_message.id
    limit 1;
  end if;

  return query select
    v_message.id,
    v_message.conversation_id,
    v_message.sender_id,
    v_message.body,
    v_message.created_at,
    v_job_id,
    v_inserted;
end;
$$;

create or replace function public.get_direct_conversation_details(
  p_conversation_id uuid
)
returns table (
  conversation_id uuid,
  peer_id uuid,
  peer_display_name text,
  peer_username text,
  peer_avatar_url text,
  last_message_at timestamptz,
  blocked boolean,
  blocked_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    conversation.id,
    peer.id,
    peer.display_name,
    peer.username,
    peer.avatar_url,
    conversation.last_message_at,
    public.direct_message_users_blocked(auth.uid(), peer.id),
    exists (
      select 1 from public.user_blocks block_row
      where block_row.blocker_id = auth.uid() and block_row.blocked_id = peer.id
    )
  from public.conversations conversation
  join public.profiles peer
    on peer.id = case
      when conversation.user_low_id = auth.uid() then conversation.user_high_id
      else conversation.user_low_id
    end
  where auth.uid() is not null
    and conversation.id = p_conversation_id
    and auth.uid() in (conversation.user_low_id, conversation.user_high_id);
$$;

create or replace function public.get_direct_messages_inbox(
  p_before_last_message_at timestamptz default null,
  p_before_conversation_id uuid default null,
  p_limit integer default 30
)
returns table (
  conversation_id uuid,
  peer_id uuid,
  peer_display_name text,
  peer_username text,
  peer_avatar_url text,
  last_message_id uuid,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count integer,
  blocked boolean,
  blocked_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    conversation.id,
    peer.id,
    peer.display_name,
    peer.username,
    peer.avatar_url,
    last_message.id,
    case when last_message.deleted_at is null then last_message.body else 'Besked slettet' end,
    last_message.sender_id,
    conversation.last_message_at,
    coalesce(unread.unread_count, 0)::integer,
    public.direct_message_users_blocked(auth.uid(), peer.id),
    exists (
      select 1 from public.user_blocks block_row
      where block_row.blocker_id = auth.uid() and block_row.blocked_id = peer.id
    )
  from public.conversations conversation
  join public.conversation_members membership
    on membership.conversation_id = conversation.id
   and membership.user_id = auth.uid()
  join public.profiles peer
    on peer.id = case
      when conversation.user_low_id = auth.uid() then conversation.user_high_id
      else conversation.user_low_id
    end
  join public.messages last_message on last_message.id = conversation.last_message_id
  left join lateral (
    select count(*)::integer as unread_count
    from public.messages unread_message
    where unread_message.conversation_id = conversation.id
      and unread_message.sender_id <> auth.uid()
      and unread_message.deleted_at is null
      and (
        membership.last_read_at is null
        or unread_message.created_at > membership.last_read_at
        or (
          unread_message.created_at = membership.last_read_at
          and (
            membership.last_read_message_id is null
            or unread_message.id > membership.last_read_message_id
          )
        )
      )
  ) unread on true
  where auth.uid() is not null
    and membership.archived_at is null
    and conversation.last_message_at is not null
    and (
      p_before_last_message_at is null
      or p_before_conversation_id is null
      or (conversation.last_message_at, conversation.id) <
        (p_before_last_message_at, p_before_conversation_id)
    )
  order by conversation.last_message_at desc, conversation.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 30);
$$;

create or replace function public.get_direct_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_message_id uuid,
  body text,
  created_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where conversation.id = p_conversation_id
      and auth.uid() in (conversation.user_low_id, conversation.user_high_id)
  ) then
    raise exception 'direct_message_conversation_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    message.client_message_id,
    message.body,
    message.created_at,
    message.deleted_at
  from public.messages message
  where message.conversation_id = p_conversation_id
    and (
      p_before_created_at is null
      or p_before_message_id is null
      or (message.created_at, message.id) < (p_before_created_at, p_before_message_id)
    )
  order by message.created_at desc, message.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 30);
end;
$$;

create or replace function public.mark_direct_conversation_read(
  p_conversation_id uuid,
  p_last_loaded_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seen_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where conversation.id = p_conversation_id
      and v_user_id in (conversation.user_low_id, conversation.user_high_id)
  ) then
    raise exception 'direct_message_conversation_not_found' using errcode = 'P0002';
  end if;

  select message.created_at
  into v_seen_at
  from public.messages message
  where message.id = p_last_loaded_message_id
    and message.conversation_id = p_conversation_id;

  if v_seen_at is null then
    raise exception 'direct_message_last_loaded_not_found' using errcode = 'P0002';
  end if;

  update public.conversation_members membership
  set
    last_read_at = v_seen_at,
    last_read_message_id = p_last_loaded_message_id
  where membership.conversation_id = p_conversation_id
    and membership.user_id = v_user_id
    and (
      membership.last_read_at is null
      or v_seen_at > membership.last_read_at
      or (
        v_seen_at = membership.last_read_at
        and p_last_loaded_message_id > coalesce(
          membership.last_read_message_id,
          '00000000-0000-0000-0000-000000000000'::uuid
        )
      )
    );
end;
$$;

create or replace function public.direct_message_unread_count_for_user(
  p_user_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.conversation_members membership
  join public.messages message on message.conversation_id = membership.conversation_id
  where membership.user_id = p_user_id
    and message.sender_id <> p_user_id
    and message.deleted_at is null
    and (
      membership.last_read_at is null
      or message.created_at > membership.last_read_at
      or (
        message.created_at = membership.last_read_at
        and (
          membership.last_read_message_id is null
          or message.id > membership.last_read_message_id
        )
      )
    );
$$;

create or replace function public.get_direct_message_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  return public.direct_message_unread_count_for_user(auth.uid());
end;
$$;

create or replace function public.get_app_badge_count(
  p_user_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target_user_id uuid := coalesce(p_user_id, auth.uid());
  v_notification_count integer;
begin
  if v_target_user_id is null then
    raise exception 'app_badge_auth_required' using errcode = '42501';
  end if;

  if auth.role() <> 'service_role' and auth.uid() is distinct from v_target_user_id then
    raise exception 'app_badge_forbidden' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_notification_count
  from public.notifications notification
  where notification.user_id = v_target_user_id
    and notification.read = false;

  return coalesce(v_notification_count, 0)
    + public.direct_message_unread_count_for_user(v_target_user_id);
end;
$$;

create or replace function public.search_direct_message_users(
  p_query text,
  p_limit integer default 20
)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  fan_level_key text,
  mutual_community_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := regexp_replace(lower(btrim(coalesce(p_query, ''))), '[%_\\]', '', 'g');
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    profile.fan_level_key,
    coalesce(mutual.mutual_count, 0)::integer
  from public.profiles profile
  left join lateral (
    select count(distinct mine.community_id)::integer as mutual_count
    from public.community_members mine
    join public.community_members theirs
      on theirs.community_id = mine.community_id
     and theirs.user_id = profile.id
    where mine.user_id = v_user_id
  ) mutual on true
  where profile.id <> v_user_id
    and not public.direct_message_users_blocked(v_user_id, profile.id)
    and (
      lower(coalesce(profile.username, '')) like '%' || v_query || '%'
      or lower(coalesce(profile.display_name, '')) like '%' || v_query || '%'
    )
  order by
    (coalesce(mutual.mutual_count, 0) > 0) desc,
    (lower(coalesce(profile.username, '')) = v_query) desc,
    (lower(coalesce(profile.username, '')) like v_query || '%') desc,
    (lower(coalesce(profile.display_name, '')) like v_query || '%') desc,
    coalesce(profile.display_name, profile.username, profile.id::text),
    profile.id
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
end;
$$;

create or replace function public.get_direct_message_block_status(
  p_other_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  return public.direct_message_users_blocked(auth.uid(), p_other_user_id);
end;
$$;

create or replace function public.set_direct_message_block(
  p_other_user_id uuid,
  p_blocked boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'direct_message_block_target_invalid' using errcode = '22023';
  end if;

  if p_blocked then
    insert into public.user_blocks (blocker_id, blocked_id)
    values (v_user_id, p_other_user_id)
    on conflict (blocker_id, blocked_id) do nothing;
  else
    delete from public.user_blocks block_row
    where block_row.blocker_id = v_user_id
      and block_row.blocked_id = p_other_user_id;
  end if;

  return p_blocked;
end;
$$;

create or replace function public.report_direct_message(
  p_conversation_id uuid,
  p_reported_user_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_report_id uuid;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if v_reason not in ('spam', 'abuse', 'harassment', 'personal_info', 'other') then
    raise exception 'direct_message_report_reason_invalid' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'direct_message_report_note_too_long' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where conversation.id = p_conversation_id
      and v_user_id in (conversation.user_low_id, conversation.user_high_id)
      and p_reported_user_id in (conversation.user_low_id, conversation.user_high_id)
      and p_reported_user_id <> v_user_id
  ) then
    raise exception 'direct_message_report_forbidden' using errcode = '42501';
  end if;

  select report.id
  into v_report_id
  from public.direct_message_reports report
  where report.conversation_id = p_conversation_id
    and report.reporter_id = v_user_id
    and report.reported_user_id = p_reported_user_id
    and report.status = 'open'
  limit 1;

  if v_report_id is null then
    insert into public.direct_message_reports (
      reporter_id,
      reported_user_id,
      conversation_id,
      reason,
      note
    )
    values (
      v_user_id,
      p_reported_user_id,
      p_conversation_id,
      v_reason,
      v_note
    )
    returning id into v_report_id;
  end if;

  return v_report_id;
end;
$$;

revoke all on function public.direct_message_users_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.validate_direct_conversation_member() from public, anon, authenticated;
revoke all on function public.validate_direct_message() from public, anon, authenticated;
revoke all on function public.direct_message_unread_count_for_user(uuid) from public, anon, authenticated;

revoke all on function public.create_or_get_direct_conversation(uuid) from public, anon;
revoke all on function public.send_direct_message(uuid, text, uuid) from public, anon;
revoke all on function public.get_direct_conversation_details(uuid) from public, anon;
revoke all on function public.get_direct_messages_inbox(timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_direct_messages(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.mark_direct_conversation_read(uuid, uuid) from public, anon;
revoke all on function public.get_direct_message_unread_count() from public, anon;
revoke all on function public.get_app_badge_count(uuid) from public, anon;
revoke all on function public.search_direct_message_users(text, integer) from public, anon;
revoke all on function public.get_direct_message_block_status(uuid) from public, anon;
revoke all on function public.set_direct_message_block(uuid, boolean) from public, anon;
revoke all on function public.report_direct_message(uuid, uuid, text, text) from public, anon;

grant execute on function public.create_or_get_direct_conversation(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, text, uuid) to authenticated;
grant execute on function public.get_direct_conversation_details(uuid) to authenticated;
grant execute on function public.get_direct_messages_inbox(timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_direct_messages(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.mark_direct_conversation_read(uuid, uuid) to authenticated;
grant execute on function public.get_direct_message_unread_count() to authenticated;
grant execute on function public.get_app_badge_count(uuid) to authenticated, service_role;
grant execute on function public.search_direct_message_users(text, integer) to authenticated;
grant execute on function public.get_direct_message_block_status(uuid) to authenticated;
grant execute on function public.set_direct_message_block(uuid, boolean) to authenticated;
grant execute on function public.report_direct_message(uuid, uuid, text, text) to authenticated;

comment on function public.search_direct_message_users(text, integer) is
  'The only supported DM user directory. Returns public profile fields only and excludes self and blocked relationships.';

comment on table public.direct_message_reports is
  'Metadata-only DM reports. Message bodies and transcripts are intentionally not copied.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
    ) then
      alter publication supabase_realtime add table public.conversations;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
    ) then
      alter publication supabase_realtime add table public.conversation_members;
    end if;
  end if;
end $$;
