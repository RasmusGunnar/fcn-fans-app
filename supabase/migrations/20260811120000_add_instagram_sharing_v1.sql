-- Instagram Sharing V1: validated external-link attachments for feed posts and
-- private direct/group messages. No Instagram media or credentials are stored.

create or replace function public.is_valid_instagram_external_share(p_share jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_url text;
  v_resource_type text;
  v_external_id text;
  v_match text[];
begin
  if jsonb_typeof(p_share) <> 'object'
    or p_share ->> 'provider' <> 'instagram'
    or jsonb_typeof(p_share -> 'canonical_url') <> 'string'
    or jsonb_typeof(p_share -> 'display_url') <> 'string'
    or jsonb_typeof(p_share -> 'resource_type') <> 'string'
    or jsonb_typeof(p_share -> 'external_id') <> 'string' then
    return false;
  end if;

  v_url := p_share ->> 'canonical_url';
  v_resource_type := p_share ->> 'resource_type';
  v_external_id := p_share ->> 'external_id';
  if char_length(v_url) > 2048 or p_share ->> 'display_url' <> v_url then
    return false;
  end if;

  v_match := regexp_match(
    v_url,
    '^https://www[.]instagram[.]com/(p|tv)/([A-Za-z0-9_-]{5,64})/$'
  );
  if v_match is not null then
    return v_resource_type = 'post' and v_external_id = v_match[2];
  end if;

  v_match := regexp_match(
    v_url,
    '^https://www[.]instagram[.]com/reel/([A-Za-z0-9_-]{5,64})/$'
  );
  if v_match is not null then
    return v_resource_type = 'reel' and v_external_id = v_match[1];
  end if;

  v_match := regexp_match(
    v_url,
    '^https://www[.]instagram[.]com/([A-Za-z0-9._]{1,30})/$'
  );
  if v_match is null
    or v_resource_type <> 'profile'
    or v_external_id <> v_match[1]
    or left(v_external_id, 1) = '.'
    or right(v_external_id, 1) = '.'
    or position('..' in v_external_id) > 0
    or lower(v_external_id) in (
      'about', 'accounts', 'api', 'challenge', 'create', 'developer', 'direct',
      'directory', 'download', 'emails', 'explore', 'graphql', 'legal', 'oauth',
      'p', 'press', 'privacy', 'reel', 'reels', 'security', 'share', 'static',
      'stories', 'terms', 'threads', 'tv', 'web'
    ) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.is_valid_instagram_external_share(jsonb) from public, anon;
grant execute on function public.is_valid_instagram_external_share(jsonb)
  to authenticated, service_role;

alter table public.posts
  drop constraint if exists posts_instagram_link_preview_check;

alter table public.posts
  add constraint posts_instagram_link_preview_check check (
    link_preview ->> 'provider' <> 'instagram'
    or public.is_valid_instagram_external_share(
      jsonb_build_object(
        'provider', link_preview -> 'provider',
        'canonical_url', link_preview -> 'url',
        'display_url', link_preview -> 'displayUrl',
        'resource_type', link_preview -> 'resourceType',
        'external_id', link_preview -> 'externalId'
      )
    )
  ) not valid;

alter table public.posts validate constraint posts_instagram_link_preview_check;

alter table public.messages
  add column if not exists external_share jsonb;

alter table public.messages
  drop constraint if exists messages_type_check,
  drop constraint if exists messages_content_check,
  drop constraint if exists messages_external_share_check;

alter table public.messages
  add constraint messages_type_check check (
    message_type in ('text', 'image', 'image_text', 'external_link', 'external_link_text')
  ),
  add constraint messages_content_check check (
    (
      message_type = 'text'
      and char_length(btrim(body)) between 1 and 2000
      and media_path is null
      and media_mime_type is null
      and media_width is null
      and media_height is null
      and media_size_bytes is null
      and external_share is null
    )
    or (
      message_type = 'image'
      and body is null
      and media_path is not null
      and media_mime_type is not null
      and media_width is not null
      and media_height is not null
      and media_size_bytes is not null
      and external_share is null
    )
    or (
      message_type = 'image_text'
      and char_length(btrim(body)) between 1 and 2000
      and media_path is not null
      and media_mime_type is not null
      and media_width is not null
      and media_height is not null
      and media_size_bytes is not null
      and external_share is null
    )
    or (
      message_type = 'external_link'
      and body is null
      and media_path is null
      and media_mime_type is null
      and media_width is null
      and media_height is null
      and media_size_bytes is null
      and external_share is not null
    )
    or (
      message_type = 'external_link_text'
      and char_length(btrim(body)) between 1 and 2000
      and media_path is null
      and media_mime_type is null
      and media_width is null
      and media_height is null
      and media_size_bytes is null
      and external_share is not null
    )
  ),
  add constraint messages_external_share_check check (
    external_share is null
    or public.is_valid_instagram_external_share(external_share)
  );

create or replace function public.send_message_v2(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id uuid,
  p_message_type text default 'text',
  p_media_path text default null,
  p_media_mime_type text default null,
  p_media_width integer default null,
  p_media_height integer default null,
  p_media_size_bytes bigint default null,
  p_external_share jsonb default null
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  message_type text,
  media_path text,
  media_mime_type text,
  media_width integer,
  media_height integer,
  media_size_bytes bigint,
  external_share jsonb,
  created_at timestamptz,
  notification_job_ids uuid[],
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
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_message_type text := lower(btrim(coalesce(p_message_type, 'text')));
  v_recent_messages integer;
  v_sender_name text;
  v_preview text;
  v_job_id uuid;
  v_job_ids uuid[] := '{}'::uuid[];
  v_recipient record;
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;
  if p_client_message_id is null then
    raise exception 'direct_message_client_id_required' using errcode = '22023';
  end if;
  if v_message_type not in (
    'text', 'image', 'image_text', 'external_link', 'external_link_text'
  ) then
    raise exception 'message_type_invalid' using errcode = '22023';
  end if;
  if p_external_share is not null
    and not public.is_valid_instagram_external_share(p_external_share) then
    raise exception 'external_share_invalid' using errcode = '22023';
  end if;

  select message.*
  into v_message
  from public.messages message
  where message.sender_id = v_user_id
    and message.client_message_id = p_client_message_id;

  if found then
    select coalesce(array_agg(job.id order by job.id), '{}'::uuid[])
    into v_job_ids
    from public.notification_jobs job
    where job.notification_type = 'direct_message'
      and job.source_table = 'messages'
      and job.source_id = v_message.id;

    return query select
      v_message.id,
      v_message.conversation_id,
      v_message.sender_id,
      v_message.body,
      v_message.message_type,
      v_message.media_path,
      v_message.media_mime_type,
      v_message.media_width,
      v_message.media_height,
      v_message.media_size_bytes,
      v_message.external_share,
      v_message.created_at,
      v_job_ids,
      false;
    return;
  end if;

  select conversation.*
  into v_conversation
  from public.conversations conversation
  join public.conversation_members membership
    on membership.conversation_id = conversation.id
   and membership.user_id = v_user_id
   and membership.left_at is null
   and membership.removed_at is null
  where conversation.id = p_conversation_id
  for update of conversation;

  if not found then
    raise exception 'direct_message_conversation_not_found' using errcode = 'P0002';
  end if;
  if v_conversation.conversation_type = 'direct'
    and public.direct_message_users_blocked(
      v_conversation.user_low_id,
      v_conversation.user_high_id
    ) then
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

  insert into public.messages (
    conversation_id,
    sender_id,
    client_message_id,
    body,
    message_type,
    media_path,
    media_mime_type,
    media_width,
    media_height,
    media_size_bytes,
    external_share,
    created_at
  ) values (
    p_conversation_id,
    v_user_id,
    p_client_message_id,
    v_body,
    v_message_type,
    p_media_path,
    p_media_mime_type,
    p_media_width,
    p_media_height,
    p_media_size_bytes,
    p_external_share,
    clock_timestamp()
  )
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
    set last_message_id = v_message.id,
        last_message_at = v_message.created_at,
        updated_at = v_message.created_at
    where id = p_conversation_id;

    update public.conversation_members membership
    set archived_at = null
    where membership.conversation_id = p_conversation_id
      and membership.left_at is null
      and membership.removed_at is null;

    select coalesce(
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(profile.username), ''),
      'En FCN-fan'
    )
    into v_sender_name
    from public.profiles profile
    where profile.id = v_user_id;

    v_preview := case
      when v_message.message_type = 'text' then
        left(regexp_replace(v_message.body, '[[:space:]]+', ' ', 'g'), 90)
      when v_message.message_type in ('image', 'image_text') then
        chr(128247) || ' Sendte et billede'
      when v_message.external_share ->> 'resource_type' = 'reel' then 'Instagram-reel'
      when v_message.external_share ->> 'resource_type' = 'profile' then 'Instagram-profil'
      else 'Instagram-opslag'
    end;

    for v_recipient in
      select membership.user_id
      from public.conversation_members membership
      left join public.push_preferences preference
        on preference.user_id = membership.user_id
      where membership.conversation_id = p_conversation_id
        and membership.user_id <> v_user_id
        and membership.left_at is null
        and membership.removed_at is null
        and coalesce(preference.direct_messages_enabled, true)
    loop
      select enqueue_result.job_id
      into v_job_id
      from public.enqueue_notification(
        p_recipient_user_id => v_recipient.user_id,
        p_notification_type => 'direct_message',
        p_title => case
          when v_conversation.conversation_type = 'group' then v_conversation.name
          else coalesce(v_sender_name, 'En FCN-fan')
        end,
        p_body => case
          when v_conversation.conversation_type = 'group' then
            coalesce(v_sender_name, 'En FCN-fan') || ': ' || v_preview
          when v_message.message_type in ('external_link', 'external_link_text') then
            'Sendte et ' || v_preview
          else v_preview
        end,
        p_dedupe_key =>
          'direct_message:' || v_message.id::text || ':' || v_recipient.user_id::text,
        p_data => jsonb_build_object(
          'targetType', 'direct_message',
          'type', 'direct_message',
          'notificationType', 'direct_message',
          'conversationType', v_conversation.conversation_type,
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

      if v_job_id is not null then
        v_job_ids := array_append(v_job_ids, v_job_id);
      end if;
    end loop;
  else
    select coalesce(array_agg(job.id order by job.id), '{}'::uuid[])
    into v_job_ids
    from public.notification_jobs job
    where job.notification_type = 'direct_message'
      and job.source_table = 'messages'
      and job.source_id = v_message.id;
  end if;

  return query select
    v_message.id,
    v_message.conversation_id,
    v_message.sender_id,
    v_message.body,
    v_message.message_type,
    v_message.media_path,
    v_message.media_mime_type,
    v_message.media_width,
    v_message.media_height,
    v_message.media_size_bytes,
    v_message.external_share,
    v_message.created_at,
    v_job_ids,
    v_inserted;
end;
$$;

drop function if exists public.get_messages_inbox(timestamptz, uuid, integer);
create function public.get_messages_inbox(
  p_before_activity_at timestamptz default null,
  p_before_conversation_id uuid default null,
  p_limit integer default 30
)
returns table (
  conversation_id uuid,
  conversation_type text,
  conversation_name text,
  conversation_avatar_path text,
  peer_id uuid,
  peer_display_name text,
  peer_username text,
  peer_avatar_url text,
  last_message_id uuid,
  last_message_body text,
  last_message_type text,
  last_message_media_path text,
  last_message_external_share jsonb,
  last_message_sender_id uuid,
  last_message_sender_name text,
  last_message_at timestamptz,
  activity_at timestamptz,
  unread_count integer,
  blocked boolean,
  blocked_by_me boolean,
  member_count integer,
  current_user_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    conversation.id,
    conversation.conversation_type,
    conversation.name,
    conversation.avatar_path,
    peer.id,
    peer.display_name,
    peer.username,
    peer.avatar_url,
    last_message.id,
    case
      when last_message.deleted_at is not null then 'Besked slettet'
      else last_message.body
    end,
    last_message.message_type,
    last_message.media_path,
    case when last_message.deleted_at is null then last_message.external_share else null end,
    last_message.sender_id,
    coalesce(
      nullif(btrim(last_sender.display_name), ''),
      nullif(btrim(last_sender.username), ''),
      'En FCN-fan'
    ),
    conversation.last_message_at,
    coalesce(conversation.last_message_at, conversation.created_at),
    coalesce(unread.unread_count, 0)::integer,
    case when conversation.conversation_type = 'direct'
      then public.direct_message_users_blocked(auth.uid(), peer.id)
      else false
    end,
    case when conversation.conversation_type = 'direct' then exists (
      select 1 from public.user_blocks block_row
      where block_row.blocker_id = auth.uid() and block_row.blocked_id = peer.id
    ) else false end,
    member_total.member_count,
    membership.role
  from public.conversations conversation
  join public.conversation_members membership
    on membership.conversation_id = conversation.id
   and membership.user_id = auth.uid()
   and membership.left_at is null
   and membership.removed_at is null
  left join public.profiles peer
    on conversation.conversation_type = 'direct'
   and peer.id = case
     when conversation.user_low_id = auth.uid() then conversation.user_high_id
     else conversation.user_low_id
   end
  left join public.messages last_message on last_message.id = conversation.last_message_id
  left join public.profiles last_sender on last_sender.id = last_message.sender_id
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
  left join lateral (
    select count(*)::integer as member_count
    from public.conversation_members active_member
    where active_member.conversation_id = conversation.id
      and active_member.left_at is null
      and active_member.removed_at is null
  ) member_total on true
  where auth.uid() is not null
    and membership.archived_at is null
    and (
      p_before_activity_at is null
      or p_before_conversation_id is null
      or (coalesce(conversation.last_message_at, conversation.created_at), conversation.id) <
        (p_before_activity_at, p_before_conversation_id)
    )
  order by coalesce(conversation.last_message_at, conversation.created_at) desc, conversation.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 30);
$$;

drop function if exists public.get_conversation_messages(uuid, timestamptz, uuid, integer);
create function public.get_conversation_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz default null,
  p_before_message_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_display_name text,
  sender_username text,
  sender_avatar_url text,
  client_message_id uuid,
  body text,
  message_type text,
  media_path text,
  media_mime_type text,
  media_width integer,
  media_height integer,
  media_size_bytes bigint,
  external_share jsonb,
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
  if not public.is_conversation_active_member(p_conversation_id, auth.uid()) then
    raise exception 'direct_message_conversation_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    message.client_message_id,
    message.body,
    message.message_type,
    message.media_path,
    message.media_mime_type,
    message.media_width,
    message.media_height,
    message.media_size_bytes,
    case when message.deleted_at is null then message.external_share else null end,
    message.created_at,
    message.deleted_at
  from public.messages message
  join public.profiles profile on profile.id = message.sender_id
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

revoke all on function public.send_message_v2(
  uuid, text, uuid, text, text, text, integer, integer, bigint, jsonb
) from public, anon;
revoke all on function public.get_messages_inbox(timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_conversation_messages(uuid, timestamptz, uuid, integer)
  from public, anon;

grant execute on function public.send_message_v2(
  uuid, text, uuid, text, text, text, integer, integer, bigint, jsonb
) to authenticated;
grant execute on function public.get_messages_inbox(timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.get_conversation_messages(uuid, timestamptz, uuid, integer)
  to authenticated;

comment on column public.messages.external_share is
  'Validated external-link attachment metadata. Instagram V1 stores URLs only, never remote media.';
comment on function public.send_message_v2(
  uuid, text, uuid, text, text, text, integer, integer, bigint, jsonb
) is 'Idempotently sends a text/image/external-link message and enqueues recipient push jobs.';
