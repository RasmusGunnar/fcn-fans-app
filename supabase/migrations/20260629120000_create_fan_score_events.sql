-- Passive fan-score ledger for the future shared weekly score engine.
-- This migration only records future qualifying activity. It does not backfill,
-- change weekly_ranking, weekly_top_fan, sync_fan_levels, or visible UI.

alter table if exists public.posts
  add column if not exists media_article_provenance text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'posts'
      and c.conname = 'posts_media_article_provenance_check'
  ) then
    alter table public.posts
      add constraint posts_media_article_provenance_check
      check (
        media_article_provenance is null
        or media_article_provenance in (
          'user_submitted',
          'admin_created',
          'imported_candidate',
          'system_imported'
        )
      );
  end if;
end $$;

create table if not exists public.fan_score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (
    activity_type in (
      'post',
      'poll_post',
      'media_article',
      'comment',
      'reply',
      'like_given_post',
      'like_given_comment',
      'like_received_post',
      'like_received_comment',
      'poll_vote',
      'match_rsvp',
      'event_rsvp',
      'fan_activity_registration',
      'checkin_home',
      'checkin_away'
    )
  ),
  source_table text not null check (
    source_table in (
      'posts',
      'comments_v2',
      'likes_v2',
      'poll_votes',
      'rsvps',
      'match_checkins',
      'fan_activity_registrations'
    )
  ),
  source_id text not null,
  target_type text null,
  target_id text null,
  target_owner_user_id uuid null references auth.users(id) on delete set null,
  occurred_at timestamptz not null,
  cph_week_start date not null,
  cph_day date not null,
  base_points integer not null check (base_points >= 0),
  category text not null check (
    category in (
      'post_or_poll',
      'comment_or_reply',
      'likes_given',
      'likes_received',
      'poll_vote',
      'participation',
      'checkin'
    )
  ),
  meaningful_own_action boolean not null default false,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoke_reason text null,
  constraint fan_score_events_dedupe_key_unique unique (dedupe_key)
);

create index if not exists fan_score_events_week_user_idx
  on public.fan_score_events (cph_week_start, user_id)
  where revoked_at is null;

create index if not exists fan_score_events_user_occurred_idx
  on public.fan_score_events (user_id, occurred_at desc)
  where revoked_at is null;

create index if not exists fan_score_events_activity_occurred_idx
  on public.fan_score_events (activity_type, occurred_at desc)
  where revoked_at is null;

create index if not exists fan_score_events_target_idx
  on public.fan_score_events (target_type, target_id)
  where revoked_at is null;

alter table public.fan_score_events enable row level security;

revoke all on table public.fan_score_events from anon;
revoke all on table public.fan_score_events from authenticated;
grant select on table public.fan_score_events to authenticated;

drop policy if exists "fan score events read own" on public.fan_score_events;
create policy "fan score events read own"
  on public.fan_score_events
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "fan score events app admins read all" on public.fan_score_events;
create policy "fan score events app admins read all"
  on public.fan_score_events
  for select
  to authenticated
  using (public.is_app_admin());

create or replace function public.fan_score_is_app_admin_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = p_user_id
  );
$$;

revoke all on function public.fan_score_is_app_admin_user(uuid) from public;
revoke all on function public.fan_score_is_app_admin_user(uuid) from anon;
revoke all on function public.fan_score_is_app_admin_user(uuid) from authenticated;

create or replace function public.record_fan_score_event(
  p_user_id uuid,
  p_activity_type text,
  p_source_table text,
  p_source_id text,
  p_target_type text default null,
  p_target_id text default null,
  p_target_owner_user_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_base_points integer default 0,
  p_category text default 'post_or_poll',
  p_meaningful_own_action boolean default false,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_cph_day date := (v_occurred_at at time zone 'Europe/Copenhagen')::date;
  v_cph_week_start date := v_cph_day - (extract(isodow from v_cph_day)::int - 1);
  v_inserted_id uuid;
begin
  if p_user_id is null or p_dedupe_key is null or btrim(p_dedupe_key) = '' then
    return null;
  end if;

  insert into public.fan_score_events (
    user_id,
    activity_type,
    source_table,
    source_id,
    target_type,
    target_id,
    target_owner_user_id,
    occurred_at,
    cph_week_start,
    cph_day,
    base_points,
    category,
    meaningful_own_action,
    dedupe_key,
    metadata
  )
  values (
    p_user_id,
    p_activity_type,
    p_source_table,
    p_source_id,
    nullif(btrim(coalesce(p_target_type, '')), ''),
    nullif(btrim(coalesce(p_target_id, '')), ''),
    p_target_owner_user_id,
    v_occurred_at,
    v_cph_week_start,
    v_cph_day,
    greatest(0, coalesce(p_base_points, 0)),
    p_category,
    coalesce(p_meaningful_own_action, false),
    btrim(p_dedupe_key),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (dedupe_key) do nothing
  returning id into v_inserted_id;

  return v_inserted_id;
end;
$$;

revoke all on function public.record_fan_score_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  integer,
  text,
  boolean,
  text,
  jsonb
) from public;
revoke all on function public.record_fan_score_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  integer,
  text,
  boolean,
  text,
  jsonb
) from anon;
revoke all on function public.record_fan_score_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  integer,
  text,
  boolean,
  text,
  jsonb
) from authenticated;

create or replace function public.fan_score_normalize_team_name(p_value text)
returns text
language sql
immutable
as $$
  select replace(
    replace(
      replace(
        replace(
          replace(
            replace(lower(coalesce(p_value, '')), chr(230), 'ae'),
            chr(248),
            'o'
          ),
          chr(229),
          'a'
        ),
        chr(195) || chr(166),
        'ae'
      ),
      chr(195) || chr(184),
      'o'
    ),
    chr(195) || chr(165),
    'a'
  );
$$;

create or replace function public.capture_post_fan_score_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_type text := lower(coalesce(new.post_type, 'post'));
  v_actor_type text := lower(coalesce(new.actor_type, 'user'));
  v_activity_type text;
begin
  if new.author_id is null or public.fan_score_is_app_admin_user(new.author_id) then
    return new;
  end if;

  if v_post_type = 'media_article' then
    if new.media_article_provenance is distinct from 'user_submitted' then
      return new;
    end if;
    v_activity_type := 'media_article';
  elsif v_actor_type = 'community' then
    return new;
  elsif new.poll_data is not null then
    v_activity_type := 'poll_post';
  else
    v_activity_type := 'post';
  end if;

  perform public.record_fan_score_event(
    p_user_id := new.author_id,
    p_activity_type := v_activity_type,
    p_source_table := 'posts',
    p_source_id := new.id::text,
    p_target_type := v_post_type,
    p_target_id := new.id::text,
    p_target_owner_user_id := new.author_id,
    p_occurred_at := new.created_at,
    p_base_points := 8,
    p_category := 'post_or_poll',
    p_meaningful_own_action := true,
    p_dedupe_key := 'post:' || new.id::text || ':' || new.author_id::text,
    p_metadata := jsonb_build_object(
      'post_type', v_post_type,
      'actor_type', v_actor_type,
      'media_article_provenance', new.media_article_provenance
    )
  );

  return new;
exception
  when others then
    raise warning 'fan_score_capture posts skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists fan_score_capture_posts_after_insert on public.posts;
create trigger fan_score_capture_posts_after_insert
  after insert on public.posts
  for each row
  execute function public.capture_post_fan_score_event();

create or replace function public.capture_comment_fan_score_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_type text := case when new.parent_id is null then 'comment' else 'reply' end;
begin
  if new.author_id is null or public.fan_score_is_app_admin_user(new.author_id) then
    return new;
  end if;

  perform public.record_fan_score_event(
    p_user_id := new.author_id,
    p_activity_type := v_activity_type,
    p_source_table := 'comments_v2',
    p_source_id := new.id::text,
    p_target_type := new.target_type::text,
    p_target_id := new.target_id,
    p_target_owner_user_id := null,
    p_occurred_at := new.created_at,
    p_base_points := 2,
    p_category := 'comment_or_reply',
    p_meaningful_own_action := true,
    p_dedupe_key := 'comment:' || new.id::text || ':' || new.author_id::text,
    p_metadata := jsonb_build_object(
      'parent_id', new.parent_id,
      'target_type', new.target_type::text,
      'target_id', new.target_id
    )
  );

  return new;
exception
  when others then
    raise warning 'fan_score_capture comments_v2 skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists fan_score_capture_comments_after_insert on public.comments_v2;
create trigger fan_score_capture_comments_after_insert
  after insert on public.comments_v2
  for each row
  execute function public.capture_comment_fan_score_event();

create or replace function public.capture_like_fan_score_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_owner_user_id uuid;
  v_target_type text := lower(coalesce(new.target_type, ''));
  v_given_activity_type text;
  v_received_activity_type text;
begin
  if new.user_id is null
    or public.fan_score_is_app_admin_user(new.user_id)
    or v_target_type not in ('post', 'comment') then
    return new;
  end if;

  if v_target_type = 'post' then
    select p.author_id
    into v_target_owner_user_id
    from public.posts p
    where p.id::text = new.target_id
    limit 1;
    v_given_activity_type := 'like_given_post';
    v_received_activity_type := 'like_received_post';
  else
    select c.author_id
    into v_target_owner_user_id
    from public.comments_v2 c
    where c.id::text = new.target_id
    limit 1;
    v_given_activity_type := 'like_given_comment';
    v_received_activity_type := 'like_received_comment';
  end if;

  if v_target_owner_user_id is null or v_target_owner_user_id = new.user_id then
    return new;
  end if;

  perform public.record_fan_score_event(
    p_user_id := new.user_id,
    p_activity_type := v_given_activity_type,
    p_source_table := 'likes_v2',
    p_source_id := new.id::text,
    p_target_type := v_target_type,
    p_target_id := new.target_id,
    p_target_owner_user_id := v_target_owner_user_id,
    p_occurred_at := new.created_at,
    p_base_points := 1,
    p_category := 'likes_given',
    p_meaningful_own_action := false,
    p_dedupe_key := 'like_given:' || v_target_type || ':' || new.target_id || ':' || new.user_id::text,
    p_metadata := jsonb_build_object('like_id', new.id)
  );

  if not public.fan_score_is_app_admin_user(v_target_owner_user_id) then
    perform public.record_fan_score_event(
      p_user_id := v_target_owner_user_id,
      p_activity_type := v_received_activity_type,
      p_source_table := 'likes_v2',
      p_source_id := new.id::text,
      p_target_type := v_target_type,
      p_target_id := new.target_id,
      p_target_owner_user_id := v_target_owner_user_id,
      p_occurred_at := new.created_at,
      p_base_points := 1,
      p_category := 'likes_received',
      p_meaningful_own_action := false,
      p_dedupe_key := 'like_received:' || v_target_type || ':' || new.target_id || ':from:' || new.user_id::text || ':to:' || v_target_owner_user_id::text,
      p_metadata := jsonb_build_object('like_id', new.id, 'liker_user_id', new.user_id)
    );
  end if;

  return new;
exception
  when others then
    raise warning 'fan_score_capture likes_v2 skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists fan_score_capture_likes_after_insert on public.likes_v2;
create trigger fan_score_capture_likes_after_insert
  after insert on public.likes_v2
  for each row
  execute function public.capture_like_fan_score_events();

create or replace function public.capture_poll_vote_fan_score_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author_id uuid;
  v_poll_data jsonb;
begin
  if new.user_id is null or public.fan_score_is_app_admin_user(new.user_id) then
    return new;
  end if;

  select p.author_id, p.poll_data
  into v_post_author_id, v_poll_data
  from public.posts p
  where p.id = new.post_id
  limit 1;

  if v_post_author_id is null
    or v_poll_data is null
    or v_post_author_id = new.user_id then
    return new;
  end if;

  perform public.record_fan_score_event(
    p_user_id := new.user_id,
    p_activity_type := 'poll_vote',
    p_source_table := 'poll_votes',
    p_source_id := new.id::text,
    p_target_type := 'post',
    p_target_id := new.post_id::text,
    p_target_owner_user_id := v_post_author_id,
    p_occurred_at := new.created_at,
    p_base_points := 1,
    p_category := 'poll_vote',
    p_meaningful_own_action := true,
    p_dedupe_key := 'poll_vote:' || new.post_id::text || ':' || new.user_id::text,
    p_metadata := jsonb_build_object('option_id', new.option_id)
  );

  return new;
exception
  when others then
    raise warning 'fan_score_capture poll_votes skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists fan_score_capture_poll_votes_after_insert on public.poll_votes;
create trigger fan_score_capture_poll_votes_after_insert
  after insert on public.poll_votes
  for each row
  execute function public.capture_poll_vote_fan_score_event();

create or replace function public.capture_rsvp_fan_score_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text := lower(coalesce(new.entity_type, ''));
  v_occurred_at timestamptz := case when tg_op = 'UPDATE' then now() else new.created_at end;
begin
  if new.user_id is null
    or public.fan_score_is_app_admin_user(new.user_id)
    or new.status <> 'going'
    or v_entity_type not in ('match', 'event') then
    return new;
  end if;

  perform public.record_fan_score_event(
    p_user_id := new.user_id,
    p_activity_type := case when v_entity_type = 'match' then 'match_rsvp' else 'event_rsvp' end,
    p_source_table := 'rsvps',
    p_source_id := new.id::text,
    p_target_type := v_entity_type,
    p_target_id := new.entity_id,
    p_target_owner_user_id := null,
    p_occurred_at := v_occurred_at,
    p_base_points := 2,
    p_category := 'participation',
    p_meaningful_own_action := true,
    p_dedupe_key := 'rsvp:' || v_entity_type || ':' || new.entity_id || ':' || new.user_id::text,
    p_metadata := jsonb_build_object(
      'status', new.status,
      'operation', tg_op,
      'row_created_at', new.created_at
    )
  );

  return new;
exception
  when others then
    raise warning 'fan_score_capture rsvps skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists fan_score_capture_rsvps_after_insert_or_status_update on public.rsvps;
create trigger fan_score_capture_rsvps_after_insert_or_status_update
  after insert or update of status on public.rsvps
  for each row
  execute function public.capture_rsvp_fan_score_event();

create or replace function public.capture_match_checkin_fan_score_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home_team text;
  v_away_team text;
  v_home_normalized text;
  v_away_normalized text;
  v_is_away boolean;
begin
  if new.user_id is null or public.fan_score_is_app_admin_user(new.user_id) then
    return new;
  end if;

  select f.home_team, f.away_team
  into v_home_team, v_away_team
  from public.fixtures f
  where f.id = new.match_id
  limit 1;

  if v_home_team is null and v_away_team is null then
    return new;
  end if;

  v_home_normalized := public.fan_score_normalize_team_name(v_home_team);
  v_away_normalized := public.fan_score_normalize_team_name(v_away_team);
  v_is_away := (
    (position('nordsjaelland' in v_away_normalized) > 0 or position('nordsjalland' in v_away_normalized) > 0)
    and not (position('nordsjaelland' in v_home_normalized) > 0 or position('nordsjalland' in v_home_normalized) > 0)
  );

  perform public.record_fan_score_event(
    p_user_id := new.user_id,
    p_activity_type := case when v_is_away then 'checkin_away' else 'checkin_home' end,
    p_source_table := 'match_checkins',
    p_source_id := new.id::text,
    p_target_type := 'match',
    p_target_id := new.match_id::text,
    p_target_owner_user_id := null,
    p_occurred_at := new.created_at,
    p_base_points := case when v_is_away then 18 else 10 end,
    p_category := 'checkin',
    p_meaningful_own_action := true,
    p_dedupe_key := 'match_checkin:' || new.match_id::text || ':' || new.user_id::text,
    p_metadata := jsonb_build_object(
      'home_team', v_home_team,
      'away_team', v_away_team,
      'is_away', v_is_away
    )
  );

  return new;
exception
  when others then
    raise warning 'fan_score_capture match_checkins skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists fan_score_capture_match_checkins_after_insert on public.match_checkins;
create trigger fan_score_capture_match_checkins_after_insert
  after insert on public.match_checkins
  for each row
  execute function public.capture_match_checkin_fan_score_event();

create or replace function public.capture_fan_activity_registration_score_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(new.status, ''));
  v_occurred_at timestamptz := case when tg_op = 'UPDATE' then now() else new.created_at end;
begin
  if new.user_id is null
    or public.fan_score_is_app_admin_user(new.user_id)
    or v_status not in ('confirmed', 'pending_verification') then
    return new;
  end if;

  perform public.record_fan_score_event(
    p_user_id := new.user_id,
    p_activity_type := 'fan_activity_registration',
    p_source_table := 'fan_activity_registrations',
    p_source_id := new.id::text,
    p_target_type := 'fan_activity',
    p_target_id := new.fan_activity_id::text,
    p_target_owner_user_id := null,
    p_occurred_at := v_occurred_at,
    p_base_points := 4,
    p_category := 'participation',
    p_meaningful_own_action := true,
    p_dedupe_key := 'fan_activity_registration:' || new.fan_activity_id::text || ':' || new.user_id::text,
    p_metadata := jsonb_build_object(
      'status', new.status,
      'operation', tg_op,
      'row_created_at', new.created_at
    )
  );

  return new;
exception
  when others then
    raise warning 'fan_score_capture fan_activity_registrations skipped: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists fan_score_capture_fan_activity_registrations_after_insert_or_status_update
  on public.fan_activity_registrations;
create trigger fan_score_capture_fan_activity_registrations_after_insert_or_status_update
  after insert or update of status on public.fan_activity_registrations
  for each row
  execute function public.capture_fan_activity_registration_score_event();

revoke all on function public.capture_post_fan_score_event() from public;
revoke all on function public.capture_post_fan_score_event() from anon;
revoke all on function public.capture_post_fan_score_event() from authenticated;

revoke all on function public.capture_comment_fan_score_event() from public;
revoke all on function public.capture_comment_fan_score_event() from anon;
revoke all on function public.capture_comment_fan_score_event() from authenticated;

revoke all on function public.capture_like_fan_score_events() from public;
revoke all on function public.capture_like_fan_score_events() from anon;
revoke all on function public.capture_like_fan_score_events() from authenticated;

revoke all on function public.capture_poll_vote_fan_score_event() from public;
revoke all on function public.capture_poll_vote_fan_score_event() from anon;
revoke all on function public.capture_poll_vote_fan_score_event() from authenticated;

revoke all on function public.capture_rsvp_fan_score_event() from public;
revoke all on function public.capture_rsvp_fan_score_event() from anon;
revoke all on function public.capture_rsvp_fan_score_event() from authenticated;

revoke all on function public.capture_match_checkin_fan_score_event() from public;
revoke all on function public.capture_match_checkin_fan_score_event() from anon;
revoke all on function public.capture_match_checkin_fan_score_event() from authenticated;

revoke all on function public.capture_fan_activity_registration_score_event() from public;
revoke all on function public.capture_fan_activity_registration_score_event() from anon;
revoke all on function public.capture_fan_activity_registration_score_event() from authenticated;
