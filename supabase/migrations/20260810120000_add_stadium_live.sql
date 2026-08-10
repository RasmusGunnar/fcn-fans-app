-- Stadion Live V1: private opt-in directory, personal reactions, realtime,
-- and transactional Notification Engine v2 integration.

create table public.stadium_live_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_visible boolean not null default false,
  reactions_enabled boolean not null default true,
  section_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stadium_live_preferences_section_check check (
    section_label is null
    or char_length(section_label) between 1 and 30
  )
);

create table public.social_reactions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  context_type text not null,
  context_id uuid not null,
  reaction_type text not null,
  reply_to_reaction_id uuid references public.social_reactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint social_reactions_distinct_users_check check (actor_id <> recipient_user_id),
  constraint social_reactions_context_type_check check (context_type = 'stadium'),
  constraint social_reactions_reaction_type_check check (
    reaction_type in ('high_five', 'come_on', 'cheers', 'fire', 'heart', 'laugh')
  )
);

create index social_reactions_recipient_context_created_idx
  on public.social_reactions (recipient_user_id, context_type, context_id, created_at desc);

create index social_reactions_actor_context_created_idx
  on public.social_reactions (actor_id, context_type, context_id, created_at desc);

create index social_reactions_actor_recipient_cooldown_idx
  on public.social_reactions (actor_id, recipient_user_id, context_id, created_at desc);

create index social_reactions_reply_idx
  on public.social_reactions (reply_to_reaction_id)
  where reply_to_reaction_id is not null;

alter table public.push_preferences
  add column if not exists stadium_reactions_enabled boolean not null default true;

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
      'direct_message',
      'stadium_reaction'
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
      'direct_messages',
      'stadium_reactions'
    )
  );

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
      'media_digest',
      'stadium_reaction'
    )
  );

create or replace function public.set_stadium_live_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger stadium_live_preferences_set_updated_at
before update on public.stadium_live_preferences
for each row execute function public.set_stadium_live_preferences_updated_at();

create or replace function public.is_stadium_live_match_open(
  p_event_id uuid,
  p_at timestamptz default clock_timestamp()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fixtures fixture
    where fixture.id = p_event_id
      and abs(extract(epoch from (fixture.kickoff_at - p_at))) <= 21600
  );
$$;

create or replace function public.is_stadium_live_blocked(
  p_first_user_id uuid,
  p_second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null and auth.uid() not in (p_first_user_id, p_second_user_id) then true
    else exists (
      select 1
      from public.user_blocks block_row
      where (block_row.blocker_id = p_first_user_id and block_row.blocked_id = p_second_user_id)
         or (block_row.blocker_id = p_second_user_id and block_row.blocked_id = p_first_user_id)
    )
  end;
$$;

create or replace function public.get_stadium_live_preferences()
returns table (
  is_visible boolean,
  reactions_enabled boolean,
  section_label text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    coalesce(preference.is_visible, false),
    coalesce(preference.reactions_enabled, true),
    preference.section_label,
    preference.updated_at
  from (select 1) seed
  left join public.stadium_live_preferences preference
    on preference.user_id = v_user_id;
end;
$$;

create or replace function public.update_stadium_live_preferences(
  p_is_visible boolean,
  p_reactions_enabled boolean,
  p_section_label text default null
)
returns table (
  is_visible boolean,
  reactions_enabled boolean,
  section_label text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_section_label text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_section_label := nullif(
    regexp_replace(
      regexp_replace(btrim(coalesce(p_section_label, '')), '[[:cntrl:]]+', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if v_section_label is not null and char_length(v_section_label) > 30 then
    raise exception 'Afsnit eller tribune må højst være 30 tegn' using errcode = '22023';
  end if;

  insert into public.stadium_live_preferences (
    user_id,
    is_visible,
    reactions_enabled,
    section_label
  )
  values (
    v_user_id,
    coalesce(p_is_visible, false),
    coalesce(p_reactions_enabled, true),
    v_section_label
  )
  on conflict (user_id) do update
  set
    is_visible = excluded.is_visible,
    reactions_enabled = excluded.reactions_enabled,
    section_label = excluded.section_label;

  return query
  select
    preference.is_visible,
    preference.reactions_enabled,
    preference.section_label,
    preference.updated_at
  from public.stadium_live_preferences preference
  where preference.user_id = v_user_id;
end;
$$;

create or replace function public.get_match_checkin_snapshot(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_checked_in boolean;
  v_is_visible boolean;
  v_is_open boolean;
  v_visible_count integer;
  v_profiles jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.match_checkins checkin
    where checkin.match_id = p_match_id
      and checkin.user_id = v_user_id
  ) into v_is_checked_in;

  select public.is_stadium_live_match_open(p_match_id) into v_is_open;

  select exists (
    select 1
    from public.stadium_live_preferences preference
    where preference.user_id = v_user_id
      and preference.is_visible = true
  ) into v_is_visible;

  if v_is_open then
    select count(*)::integer
    into v_visible_count
    from public.match_checkins checkin
    join public.stadium_live_preferences preference
      on preference.user_id = checkin.user_id
     and preference.is_visible = true
    where checkin.match_id = p_match_id
      and not public.is_stadium_live_blocked(v_user_id, checkin.user_id);
  else
    v_visible_count := 0;
  end if;

  if v_is_open and v_is_checked_in and v_is_visible then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', profile.id,
          'display_name', profile.display_name,
          'avatar_url', profile.avatar_url
        ) order by checkin.created_at desc
      ),
      '[]'::jsonb
    )
    into v_profiles
    from public.match_checkins checkin
    join public.stadium_live_preferences preference
      on preference.user_id = checkin.user_id
     and preference.is_visible = true
    join public.profiles profile on profile.id = checkin.user_id
    where checkin.match_id = p_match_id
      and checkin.user_id <> v_user_id
      and not public.is_stadium_live_blocked(v_user_id, checkin.user_id);
  else
    v_profiles := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'count_checked_in', coalesce(v_visible_count, 0),
    'is_checked_in', v_is_checked_in,
    'profiles', coalesce(v_profiles, '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_stadium_live_count(p_event_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_stadium_live_match_open(p_event_id) then
    return 0;
  end if;

  select count(*)::integer
  into v_count
  from public.match_checkins checkin
  join public.stadium_live_preferences preference
    on preference.user_id = checkin.user_id
   and preference.is_visible = true
  where checkin.match_id = p_event_id
    and not public.is_stadium_live_blocked(v_user_id, checkin.user_id);

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.get_stadium_live_participants(
  p_event_id uuid,
  p_after_rank integer default null,
  p_after_user_id uuid default null,
  p_limit integer default 50
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  fan_level_key text,
  section_label text,
  same_community boolean,
  reacted_recently boolean,
  can_react boolean,
  can_message boolean,
  rank_bucket integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if (p_after_rank is null) <> (p_after_user_id is null) then
    raise exception 'Invalid participant cursor' using errcode = '22023';
  end if;

  if not public.is_stadium_live_match_open(p_event_id) then
    raise exception 'Stadion Live er ikke åbent til denne kamp' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.match_checkins checkin
    where checkin.match_id = p_event_id and checkin.user_id = v_user_id
  ) then
    raise exception 'Check ind til kampen for at se Stadion Live' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.stadium_live_preferences preference
    where preference.user_id = v_user_id and preference.is_visible = true
  ) then
    raise exception 'Bliv synlig for at se Stadion Live' using errcode = '42501';
  end if;

  return query
  with scored as (
    select
      profile.id as participant_user_id,
      profile.display_name as participant_display_name,
      profile.username as participant_username,
      profile.avatar_url as participant_avatar_url,
      profile.fan_level_key as participant_fan_level_key,
      preference.section_label as participant_section_label,
      exists (
        select 1
        from public.community_members mine
        join public.community_members theirs
          on theirs.community_id = mine.community_id
         and theirs.user_id = checkin.user_id
        where mine.user_id = v_user_id
      ) as participant_same_community,
      exists (
        select 1
        from public.social_reactions reaction
        where reaction.context_type = 'stadium'
          and reaction.context_id = p_event_id
          and (
            (reaction.actor_id = v_user_id and reaction.recipient_user_id = checkin.user_id)
            or (reaction.actor_id = checkin.user_id and reaction.recipient_user_id = v_user_id)
          )
      ) as participant_reacted_recently,
      preference.reactions_enabled as participant_can_react
    from public.match_checkins checkin
    join public.stadium_live_preferences preference
      on preference.user_id = checkin.user_id
     and preference.is_visible = true
    join public.profiles profile on profile.id = checkin.user_id
    where checkin.match_id = p_event_id
      and checkin.user_id <> v_user_id
      and not public.is_stadium_live_blocked(v_user_id, checkin.user_id)
  ),
  ranked as (
    select
      scored.*,
      case
        when scored.participant_same_community then 0
        when scored.participant_reacted_recently then 1
        else 2
      end as participant_rank_bucket
    from scored
  )
  select
    ranked.participant_user_id,
    ranked.participant_display_name,
    ranked.participant_username,
    ranked.participant_avatar_url,
    ranked.participant_fan_level_key,
    ranked.participant_section_label,
    ranked.participant_same_community,
    ranked.participant_reacted_recently,
    ranked.participant_can_react,
    true,
    ranked.participant_rank_bucket,
    (select count(*) from ranked)
  from ranked
  where p_after_rank is null
     or (ranked.participant_rank_bucket, ranked.participant_user_id) > (p_after_rank, p_after_user_id)
  order by ranked.participant_rank_bucket, ranked.participant_user_id
  limit v_limit;
end;
$$;

create or replace function public.send_stadium_reaction(
  p_event_id uuid,
  p_recipient_user_id uuid,
  p_reaction_type text,
  p_reply_to_reaction_id uuid default null
)
returns table (
  reaction_id uuid,
  created_at timestamptz,
  cooldown_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_reaction public.social_reactions%rowtype;
  v_reply public.social_reactions%rowtype;
  v_actor_name text;
  v_body text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_recipient_user_id is null or p_recipient_user_id = v_actor_id then
    raise exception 'Du kan ikke sende en stadionreaktion til dig selv' using errcode = '22023';
  end if;

  if p_reaction_type not in ('high_five', 'come_on', 'cheers', 'fire', 'heart', 'laugh') then
    raise exception 'Ukendt stadionreaktion' using errcode = '22023';
  end if;

  if not public.is_stadium_live_match_open(p_event_id) then
    raise exception 'Stadion Live er ikke åbent til denne kamp' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.match_checkins checkin
    where checkin.match_id = p_event_id and checkin.user_id = v_actor_id
  ) then
    raise exception 'Du skal være checket ind til kampen' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.stadium_live_preferences preference
    where preference.user_id = v_actor_id and preference.is_visible = true
  ) then
    raise exception 'Bliv synlig for at sende stadionreaktioner' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.match_checkins checkin
    join public.stadium_live_preferences preference
      on preference.user_id = checkin.user_id
     and preference.is_visible = true
     and preference.reactions_enabled = true
    where checkin.match_id = p_event_id
      and checkin.user_id = p_recipient_user_id
  ) then
    raise exception 'Denne fan kan ikke modtage stadionreaktioner' using errcode = '42501';
  end if;

  if public.is_stadium_live_blocked(v_actor_id, p_recipient_user_id) then
    raise exception 'Reaktionen kan ikke sendes' using errcode = '42501';
  end if;

  if p_reply_to_reaction_id is not null then
    select * into v_reply
    from public.social_reactions reaction
    where reaction.id = p_reply_to_reaction_id;

    if v_reply.id is null
      or v_reply.context_type <> 'stadium'
      or v_reply.context_id <> p_event_id
      or v_reply.actor_id <> p_recipient_user_id
      or v_reply.recipient_user_id <> v_actor_id then
      raise exception 'Den valgte stadionreaktion kan ikke besvares' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || ':' || p_event_id::text, 0)
  );

  if exists (
    select 1
    from public.social_reactions reaction
    where reaction.actor_id = v_actor_id
      and reaction.recipient_user_id = p_recipient_user_id
      and reaction.context_type = 'stadium'
      and reaction.context_id = p_event_id
      and reaction.created_at > clock_timestamp() - interval '30 seconds'
  ) then
    raise exception 'Vent lidt, før du reagerer til den samme fan igen' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.social_reactions reaction
    where reaction.actor_id = v_actor_id
      and reaction.context_type = 'stadium'
      and reaction.created_at > clock_timestamp() - interval '5 minutes'
  ) >= 20 then
    raise exception 'Du har sendt mange reaktioner. Prøv igen om lidt' using errcode = 'P0001';
  end if;

  insert into public.social_reactions (
    actor_id,
    recipient_user_id,
    context_type,
    context_id,
    reaction_type,
    reply_to_reaction_id
  )
  values (
    v_actor_id,
    p_recipient_user_id,
    'stadium',
    p_event_id,
    p_reaction_type,
    p_reply_to_reaction_id
  )
  returning * into v_reaction;

  select coalesce(nullif(btrim(profile.display_name), ''), nullif(btrim(profile.username), ''), 'En fan')
  into v_actor_name
  from public.profiles profile
  where profile.id = v_actor_id;

  v_body := case p_reaction_type
    when 'high_five' then v_actor_name || ' gav dig en high five 🙌'
    when 'come_on' then v_actor_name || ' sender 🔥 Kom så!'
    when 'cheers' then v_actor_name || ' skåler med dig 🍻'
    when 'heart' then v_actor_name || ' sender dig et FCN-hjerte ❤️'
    when 'fire' then v_actor_name || ' sender Stærkt! 👏'
    else v_actor_name || ' griner med dig 😂'
  end;

  perform public.enqueue_notification(
    p_recipient_user_id => p_recipient_user_id,
    p_notification_type => 'stadium_reaction',
    p_title => 'Stadionreaktion',
    p_body => v_body,
    p_dedupe_key => 'stadium_reaction:' || v_reaction.id::text || ':' || p_recipient_user_id::text,
    p_data => jsonb_build_object(
      'type', 'stadium_reaction',
      'targetType', 'stadium_reaction',
      'reactionId', v_reaction.id,
      'eventId', p_event_id,
      'actorId', v_actor_id,
      'reactionType', p_reaction_type,
      'url', 'fcnfans://stadium/' || p_event_id::text || '?reactionId=' || v_reaction.id::text
    ),
    p_actor_user_id => v_actor_id,
    p_preference_key => 'stadium_reactions',
    p_source_table => 'social_reactions',
    p_source_id => v_reaction.id,
    p_next_attempt_at => now(),
    p_max_attempts => 5
  );

  return query select v_reaction.id, v_reaction.created_at, v_reaction.created_at + interval '30 seconds';
end;
$$;

create or replace function public.get_stadium_reactions(
  p_event_id uuid,
  p_before_created_at timestamptz default null,
  p_before_reaction_id uuid default null,
  p_limit integer default 30
)
returns table (
  reaction_id uuid,
  event_id uuid,
  actor_id uuid,
  recipient_user_id uuid,
  reaction_type text,
  reply_to_reaction_id uuid,
  created_at timestamptz,
  actor_display_name text,
  actor_username text,
  actor_avatar_url text,
  received boolean,
  replied boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 30);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if (p_before_created_at is null) <> (p_before_reaction_id is null) then
    raise exception 'Invalid reaction cursor' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.match_checkins checkin
    where checkin.match_id = p_event_id and checkin.user_id = v_user_id
  ) then
    raise exception 'Check ind til kampen for at se stadionreaktioner' using errcode = '42501';
  end if;

  return query
  select
    reaction.id,
    reaction.context_id,
    reaction.actor_id,
    reaction.recipient_user_id,
    reaction.reaction_type,
    reaction.reply_to_reaction_id,
    reaction.created_at,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    reaction.recipient_user_id = v_user_id,
    exists (
      select 1 from public.social_reactions reply
      where reply.reply_to_reaction_id = reaction.id
        and reply.actor_id = v_user_id
    )
  from public.social_reactions reaction
  join public.profiles profile on profile.id = reaction.actor_id
  where reaction.context_type = 'stadium'
    and reaction.context_id = p_event_id
    and v_user_id in (reaction.actor_id, reaction.recipient_user_id)
    and not public.is_stadium_live_blocked(reaction.actor_id, reaction.recipient_user_id)
    and (
      p_before_created_at is null
      or (reaction.created_at, reaction.id) < (p_before_created_at, p_before_reaction_id)
    )
  order by reaction.created_at desc, reaction.id desc
  limit v_limit;
end;
$$;

alter table public.stadium_live_preferences enable row level security;
alter table public.social_reactions enable row level security;

create policy stadium_live_preferences_select_own
  on public.stadium_live_preferences for select
  to authenticated
  using (user_id = auth.uid());

create policy stadium_live_preferences_insert_own
  on public.stadium_live_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

create policy stadium_live_preferences_update_own
  on public.stadium_live_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy social_reactions_select_involved
  on public.social_reactions for select
  to authenticated
  using (
    auth.uid() in (actor_id, recipient_user_id)
    and not public.is_stadium_live_blocked(actor_id, recipient_user_id)
  );

drop policy if exists "Anyone can view checkins" on public.match_checkins;
drop policy if exists match_checkins_select_public on public.match_checkins;
create policy match_checkins_select_own
  on public.match_checkins for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.stadium_live_preferences from anon, authenticated;
revoke all on public.social_reactions from anon, authenticated;
revoke select on public.match_checkins from anon;

grant select, insert, update on public.stadium_live_preferences to authenticated;
grant select on public.social_reactions to authenticated;
grant select, insert, delete on public.match_checkins to authenticated;

revoke all on function public.is_stadium_live_match_open(uuid, timestamptz) from public;
revoke all on function public.is_stadium_live_blocked(uuid, uuid) from public;
revoke all on function public.get_stadium_live_preferences() from public;
revoke all on function public.update_stadium_live_preferences(boolean, boolean, text) from public;
revoke all on function public.get_match_checkin_snapshot(uuid) from public;
revoke all on function public.get_stadium_live_count(uuid) from public;
revoke all on function public.get_stadium_live_participants(uuid, integer, uuid, integer) from public;
revoke all on function public.send_stadium_reaction(uuid, uuid, text, uuid) from public;
revoke all on function public.get_stadium_reactions(uuid, timestamptz, uuid, integer) from public;

grant execute on function public.get_stadium_live_preferences() to authenticated;
grant execute on function public.is_stadium_live_blocked(uuid, uuid) to authenticated;
grant execute on function public.update_stadium_live_preferences(boolean, boolean, text) to authenticated;
grant execute on function public.get_match_checkin_snapshot(uuid) to authenticated;
grant execute on function public.get_stadium_live_count(uuid) to authenticated;
grant execute on function public.get_stadium_live_participants(uuid, integer, uuid, integer) to authenticated;
grant execute on function public.send_stadium_reaction(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.get_stadium_reactions(uuid, timestamptz, uuid, integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'social_reactions'
    ) then
    alter publication supabase_realtime add table public.social_reactions;
  end if;
end $$;

comment on table public.stadium_live_preferences is
  'Private Stadion Live opt-in, reaction permission, and optional coarse section label.';
comment on table public.social_reactions is
  'Generic personal reaction core restricted to authenticated stadium contexts in V1.';
comment on function public.get_stadium_live_participants(uuid, integer, uuid, integer) is
  'Returns an allowlisted, block-filtered, keyset-paginated Stadion Live directory for checked-in callers.';
comment on function public.send_stadium_reaction(uuid, uuid, text, uuid) is
  'Validates and persists a stadium reaction with server-side rate limits and transactional notification outbox.';
