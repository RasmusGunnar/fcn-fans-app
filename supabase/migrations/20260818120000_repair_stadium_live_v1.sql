-- Stadium Live V1 repair:
-- - align the hosted legacy match_checkins.match_id type with fixtures.id
-- - make check-in/check-out an authenticated RPC-only path
-- - define active check-ins as Stadium Live participation and visibility
-- - use one active-check-in count across matchday surfaces

do $$
declare
  v_match_id_type text;
begin
  select columns.udt_name
  into v_match_id_type
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'match_checkins'
    and columns.column_name = 'match_id';

  if v_match_id_type is null then
    raise exception 'public.match_checkins.match_id is missing';
  end if;

  if v_match_id_type = 'text' then
    if exists (
      select 1
      from public.match_checkins checkin
      where checkin.match_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception 'public.match_checkins.match_id contains a non-UUID value';
    end if;

    alter table public.match_checkins
      alter column match_id type uuid using match_id::uuid;
  elsif v_match_id_type <> 'uuid' then
    raise exception 'Unexpected public.match_checkins.match_id type: %', v_match_id_type;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.match_checkins'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.fixtures'::regclass
      and constraint_row.conkey = array[
        (
          select attribute.attnum
          from pg_attribute attribute
          where attribute.attrelid = 'public.match_checkins'::regclass
            and attribute.attname = 'match_id'
        )::smallint
      ]
  ) then
    alter table public.match_checkins
      add constraint match_checkins_match_id_fkey
      foreign key (match_id) references public.fixtures(id) on delete cascade
      not valid;

    alter table public.match_checkins
      validate constraint match_checkins_match_id_fkey;
  end if;
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
  v_is_open boolean;
  v_participant_count integer;
  v_profiles jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select public.is_stadium_live_match_open(p_match_id)
  into v_is_open;

  select exists (
    select 1
    from public.match_checkins checkin
    where checkin.match_id = p_match_id
      and checkin.user_id = v_user_id
  )
  into v_is_checked_in;

  if v_is_open then
    select count(*)::integer
    into v_participant_count
    from public.match_checkins checkin
    where checkin.match_id = p_match_id;
  else
    v_participant_count := 0;
  end if;

  if v_is_open and v_is_checked_in then
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
    join public.profiles profile on profile.id = checkin.user_id
    where checkin.match_id = p_match_id
      and checkin.user_id <> v_user_id
      and not public.is_stadium_live_blocked(v_user_id, checkin.user_id);
  else
    v_profiles := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'count_checked_in', coalesce(v_participant_count, 0),
    'participant_count', coalesce(v_participant_count, 0),
    'is_checked_in', v_is_checked_in,
    'stadium_live_open', v_is_open,
    'can_check_in', v_is_open and not v_is_checked_in,
    'current_user_participation_state', case
      when v_is_checked_in then 'checked_in'
      when v_is_open then 'eligible'
      else 'closed'
    end,
    'profiles', coalesce(v_profiles, '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_match_checkin_status(
  p_match_id uuid,
  p_checked_in boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_checked_in is null then
    raise exception 'Check-in state is required' using errcode = '22023';
  end if;

  if p_checked_in then
    if not public.is_stadium_live_match_open(p_match_id) then
      raise exception 'Check-in er ikke åbent til denne kamp' using errcode = 'P0001';
    end if;

    insert into public.match_checkins (match_id, user_id)
    values (p_match_id, v_user_id)
    on conflict (match_id, user_id) do nothing;

    insert into public.stadium_live_preferences (
      user_id,
      is_visible,
      reactions_enabled
    )
    values (v_user_id, true, true)
    on conflict (user_id) do update
    set
      is_visible = true,
      reactions_enabled = true;
  else
    delete from public.match_checkins checkin
    where checkin.match_id = p_match_id
      and checkin.user_id = v_user_id;

    update public.stadium_live_preferences preference
    set is_visible = false
    where preference.user_id = v_user_id;
  end if;

  return public.get_match_checkin_snapshot(p_match_id);
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
  where checkin.match_id = p_event_id;

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
    select 1
    from public.match_checkins checkin
    where checkin.match_id = p_event_id
      and checkin.user_id = v_user_id
  ) then
    raise exception 'Check ind til kampen for at se Stadion Live' using errcode = '42501';
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
      coalesce(preference.reactions_enabled, true) as participant_can_react
    from public.match_checkins checkin
    left join public.stadium_live_preferences preference
      on preference.user_id = checkin.user_id
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
     or (ranked.participant_rank_bucket, ranked.participant_user_id) >
        (p_after_rank, p_after_user_id)
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
    select 1
    from public.match_checkins checkin
    where checkin.match_id = p_event_id
      and checkin.user_id = v_actor_id
  ) then
    raise exception 'Du skal være checket ind til kampen' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.match_checkins checkin
    where checkin.match_id = p_event_id
      and checkin.user_id = p_recipient_user_id
  ) then
    raise exception 'Denne fan kan ikke modtage stadionreaktioner' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.stadium_live_preferences preference
    where preference.user_id = p_recipient_user_id
      and preference.reactions_enabled = false
  ) then
    raise exception 'Denne fan kan ikke modtage stadionreaktioner' using errcode = '42501';
  end if;

  if public.is_stadium_live_blocked(v_actor_id, p_recipient_user_id) then
    raise exception 'Reaktionen kan ikke sendes' using errcode = '42501';
  end if;

  if p_reply_to_reaction_id is not null then
    select *
    into v_reply
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

  select coalesce(
    nullif(btrim(profile.display_name), ''),
    nullif(btrim(profile.username), ''),
    'En fan'
  )
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

  return query
  select
    v_reaction.id,
    v_reaction.created_at,
    v_reaction.created_at + interval '30 seconds';
end;
$$;

revoke all on table public.match_checkins from anon, authenticated;

revoke all on function public.get_match_checkin_snapshot(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_match_checkin_status(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.get_stadium_live_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_stadium_live_participants(uuid, integer, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.send_stadium_reaction(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_match_checkin_snapshot(uuid) to authenticated;
grant execute on function public.set_match_checkin_status(uuid, boolean) to authenticated;
grant execute on function public.get_stadium_live_count(uuid) to authenticated;
grant execute on function public.get_stadium_live_participants(uuid, integer, uuid, integer) to authenticated;
grant execute on function public.send_stadium_reaction(uuid, uuid, text, uuid) to authenticated;

comment on function public.set_match_checkin_status(uuid, boolean) is
  'Canonical authenticated RPC-only check-in/check-out mutation for Stadium Live participation.';
comment on function public.get_match_checkin_snapshot(uuid) is
  'Canonical matchday Stadium snapshot; count semantics are all active match_checkins in the open match window.';
comment on function public.get_stadium_live_participants(uuid, integer, uuid, integer) is
  'Returns other active checked-in fans, block-filtered and ranked by community/reaction affinity.';
