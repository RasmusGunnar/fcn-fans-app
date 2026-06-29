begin;

select plan(25);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    'authenticated',
    'authenticated',
    'fan-score-a@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'authenticated',
    'authenticated',
    'fan-score-b@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'authenticated',
    'authenticated',
    'fan-score-admin@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  );

insert into public.app_admins (user_id)
values ('00000000-0000-0000-0000-000000000103');

insert into public.posts (
  id,
  author_id,
  text,
  post_type,
  actor_type,
  actor_id,
  poll_data,
  link_preview,
  media_article_provenance
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'Plain post',
    'post',
    'user',
    '00000000-0000-0000-0000-000000000101',
    null,
    null,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000101',
    'Poll post',
    'post',
    'user',
    '00000000-0000-0000-0000-000000000101',
    '{"question":"Test?"}'::jsonb,
    null,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000101',
    'Imported article',
    'media_article',
    'user',
    '00000000-0000-0000-0000-000000000101',
    null,
    '{"url":"https://example.com/imported-article"}'::jsonb,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000101',
    'User submitted article',
    'media_article',
    'user',
    '00000000-0000-0000-0000-000000000101',
    null,
    '{"url":"https://example.com/user-submitted-article"}'::jsonb,
    'user_submitted'
  );

select is(
  (select count(*)::int from public.fan_score_events where source_table = 'posts'),
  3,
  'post trigger captures plain post, poll post, and explicit user-submitted media article'
);

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'media_article'),
  1,
  'media article capture requires explicit user_submitted provenance at insert time'
);

insert into public.comments_v2 (
  id,
  author_id,
  target_type,
  target_id,
  parent_id,
  text
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000102',
    'post',
    '10000000-0000-0000-0000-000000000001',
    null,
    'Comment'
  );

insert into public.comments_v2 (
  id,
  author_id,
  target_type,
  target_id,
  parent_id,
  text
)
values
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000101',
    'post',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Reply'
  );

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'comment'),
  1,
  'comment trigger captures top-level comment'
);

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'reply'),
  1,
  'comment trigger captures nested reply'
);

insert into public.likes_v2 (
  user_id,
  target_type,
  target_id
)
values (
  '00000000-0000-0000-0000-000000000102',
  'post',
  '10000000-0000-0000-0000-000000000001'
);

delete from public.likes_v2
where user_id = '00000000-0000-0000-0000-000000000102'
  and target_type = 'post'
  and target_id = '10000000-0000-0000-0000-000000000001';

insert into public.likes_v2 (
  user_id,
  target_type,
  target_id
)
values (
  '00000000-0000-0000-0000-000000000102',
  'post',
  '10000000-0000-0000-0000-000000000001'
);

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'like_given_post'),
  1,
  'like unlike relike captures one like_given event'
);

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'like_received_post'),
  1,
  'like unlike relike captures one like_received event'
);

insert into public.likes_v2 (
  user_id,
  target_type,
  target_id
)
values (
  '00000000-0000-0000-0000-000000000101',
  'post',
  '10000000-0000-0000-0000-000000000001'
)
on conflict do nothing;

select is(
  (
    select count(*)::int
    from public.fan_score_events
    where metadata ->> 'liker_user_id' = '00000000-0000-0000-0000-000000000101'
  ),
  0,
  'self-like captures no received event'
);

insert into public.poll_votes (
  post_id,
  option_id,
  user_id
)
values
  (
    '10000000-0000-0000-0000-000000000002',
    'yes',
    '00000000-0000-0000-0000-000000000102'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'yes',
    '00000000-0000-0000-0000-000000000101'
  );

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'poll_vote'),
  1,
  'poll vote captures once and never on own poll'
);

insert into public.rsvps (
  id,
  entity_type,
  entity_id,
  user_id,
  status
)
values (
  '30000000-0000-0000-0000-000000000001',
  'match',
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  'going'
);

update public.rsvps
set status = 'not_going'
where id = '30000000-0000-0000-0000-000000000001';

update public.rsvps
set status = 'going'
where id = '30000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'match_rsvp'),
  1,
  'RSVP going not_going going captures one event'
);

insert into public.rsvps (
  id,
  entity_type,
  entity_id,
  user_id,
  status
)
values (
  '30000000-0000-0000-0000-000000000002',
  'event',
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  'not_going'
);

update public.rsvps
set status = 'going'
where id = '30000000-0000-0000-0000-000000000002';

update public.rsvps
set status = 'not_going'
where id = '30000000-0000-0000-0000-000000000002';

update public.rsvps
set status = 'going'
where id = '30000000-0000-0000-0000-000000000002';

select is(
  (
    select count(*)::int
    from public.fan_score_events
    where dedupe_key =
      'rsvp:event:50000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000102'
  ),
  1,
  'RSVP not_going going not_going going captures one event by dedupe key'
);

insert into public.fixtures (
  id,
  provider_fixture_id,
  home_team,
  away_team,
  kickoff_at
)
values (
  '40000000-0000-0000-0000-000000000002',
  'fan-score-test-away',
  'AGF',
  'FC Nordsjaelland',
  now()
);

insert into public.match_checkins (
  match_id,
  user_id
)
values (
  '40000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000102'
);

select is(
  (select count(*)::int from public.fan_score_events where activity_type = 'checkin_away'),
  1,
  'away check-in captures one event'
);

select is(
  (
    select base_points
    from public.fan_score_events
    where activity_type = 'checkin_away'
    limit 1
  ),
  18,
  'away check-in has 18 base points'
);

do $$
begin
  perform public.record_fan_score_event(
      '00000000-0000-0000-0000-000000000102',
      'poll_vote',
      'poll_votes',
      'manual-cph-boundary',
      'post',
      'manual-post',
      null,
      '2026-06-28T22:30:00Z'::timestamptz,
      1,
      'poll_vote',
      true,
      'manual-cph-boundary',
      '{}'::jsonb
    );
end
$$;

select is(
  (
    select occurred_at
    from public.fan_score_events
    where dedupe_key = 'manual-cph-boundary'
  ),
  '2026-06-28T22:30:00Z'::timestamptz,
  'CPH boundary activity stores expected occurred_at'
);

select is(
  (
    select cph_day
    from public.fan_score_events
    where dedupe_key = 'manual-cph-boundary'
  ),
  '2026-06-29'::date,
  'CPH day is calculated after local midnight'
);

select is(
  (
    select cph_week_start
    from public.fan_score_events
    where dedupe_key = 'manual-cph-boundary'
  ),
  '2026-06-29'::date,
  'CPH week starts on Monday'
);

insert into public.communities (
  id,
  name,
  created_by
)
values (
  '60000000-0000-0000-0000-000000000001',
  'Fan score test community',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.events (
  id,
  title,
  start_at,
  created_by,
  creator_user_id,
  organizer_type,
  organizer_id
)
values (
  '50000000-0000-0000-0000-000000000001',
  'Fan score parent event',
  now(),
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  'fan',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.fan_activities (
  id,
  parent_type,
  parent_id,
  community_id,
  created_by,
  type,
  title,
  starts_at,
  is_published
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    'event',
    '50000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'tifo',
    'Fan score test activity confirmed',
    now(),
    true
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    'event',
    '50000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'tifo',
    'Fan score test activity pending verification',
    now(),
    true
  );

insert into public.fan_activity_registrations (
  id,
  fan_activity_id,
  user_id,
  status
)
values (
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  'pending_payment'
);

update public.fan_activity_registrations
set status = 'confirmed'
where id = '80000000-0000-0000-0000-000000000001';

update public.fan_activity_registrations
set status = 'pending_verification'
where id = '80000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::int
    from public.fan_score_events
    where dedupe_key =
      'fan_activity_registration:70000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000102'
  ),
  1,
  'fan activity pending_payment confirmed pending_verification captures one event'
);

insert into public.fan_activity_registrations (
  id,
  fan_activity_id,
  user_id,
  status
)
values (
  '80000001-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000102',
  'pending_payment'
);

update public.fan_activity_registrations
set status = 'pending_verification'
where id = '80000001-0000-0000-0000-000000000002';

select is(
  (
    select count(*)::int
    from public.fan_score_events
    where dedupe_key =
      'fan_activity_registration:70000000-0000-0000-0000-000000000002:00000000-0000-0000-0000-000000000102'
  ),
  1,
  'fan activity pending_payment pending_verification captures one event'
);

alter table public.fan_score_events
  add constraint fan_score_events_test_reject_failure_probe
  check (dedupe_key <> 'post:10000000-0000-0000-0000-000000009999:00000000-0000-0000-0000-000000000102');

insert into public.posts (
  id,
  author_id,
  text,
  post_type,
  actor_type,
  actor_id
)
values (
  '10000000-0000-0000-0000-000000009999',
  '00000000-0000-0000-0000-000000000102',
  'Capture failure isolation probe',
  'post',
  'user',
  '00000000-0000-0000-0000-000000000102'
);

select ok(
  exists (
    select 1
    from public.posts
    where id = '10000000-0000-0000-0000-000000009999'
  ),
  'source insert succeeds when capture insert fails'
);

select is(
  (
    select count(*)::int
    from public.fan_score_events
    where dedupe_key = 'post:10000000-0000-0000-0000-000000009999:00000000-0000-0000-0000-000000000102'
  ),
  0,
  'failed capture leaves no ledger event'
);

select is(
  has_table_privilege('authenticated', 'public.fan_score_events', 'INSERT'),
  false,
  'authenticated users have no direct insert privilege on ledger'
);

select is(
  has_table_privilege('authenticated', 'public.fan_score_events', 'UPDATE'),
  false,
  'authenticated users have no direct update privilege on ledger'
);

select is(
  has_table_privilege('authenticated', 'public.fan_score_events', 'DELETE'),
  false,
  'authenticated users have no direct delete privilege on ledger'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'capture_post_fan_score_event',
        'capture_comment_fan_score_event',
        'capture_like_fan_score_events',
        'capture_poll_vote_fan_score_event',
        'capture_rsvp_fan_score_event',
        'capture_match_checkin_fan_score_event',
        'capture_fan_activity_registration_score_event'
      )
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  'authenticated users cannot execute capture trigger functions directly'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'capture_post_fan_score_event',
        'capture_comment_fan_score_event',
        'capture_like_fan_score_events',
        'capture_poll_vote_fan_score_event',
        'capture_rsvp_fan_score_event',
        'capture_match_checkin_fan_score_event',
        'capture_fan_activity_registration_score_event'
      )
      and exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
  ),
  'public cannot execute capture trigger functions directly'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'capture_post_fan_score_event',
        'capture_comment_fan_score_event',
        'capture_like_fan_score_events',
        'capture_poll_vote_fan_score_event',
        'capture_rsvp_fan_score_event',
        'capture_match_checkin_fan_score_event',
        'capture_fan_activity_registration_score_event'
      )
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon users cannot execute capture trigger functions directly'
);

select * from finish();

rollback;
