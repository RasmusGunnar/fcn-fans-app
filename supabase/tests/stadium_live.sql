begin;

select plan(72);

select has_table('public', 'stadium_live_preferences', 'stadium preferences table exists');
select has_table('public', 'social_reactions', 'social reactions table exists');
select has_column('public', 'stadium_live_preferences', 'section_label', 'coarse section is supported');
select has_column('public', 'social_reactions', 'reply_to_reaction_id', 'reactions support one-tap replies');
select has_function('public', 'get_stadium_live_preferences', 'preferences read RPC exists');
select has_function('public', 'update_stadium_live_preferences', 'preferences update RPC exists');
select has_function('public', 'get_stadium_live_count', 'visible fan count RPC exists');
select has_function('public', 'get_stadium_live_participants', 'participant directory RPC exists');
select has_function('public', 'send_stadium_reaction', 'reaction send RPC exists');
select has_function('public', 'get_stadium_reactions', 'recent reactions RPC exists');
select is(
  has_table_privilege('authenticated', 'public.social_reactions', 'insert'),
  false,
  'authenticated users cannot insert reactions directly'
);
select is(
  has_table_privilege('authenticated', 'public.social_reactions', 'update'),
  false,
  'authenticated users cannot update reactions directly'
);
select has_column(
  'public',
  'push_preferences',
  'stadium_reactions_enabled',
  'stadium push preference exists'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'social_reactions'
  ),
  'social reactions are in the realtime publication'
);

select is(
  has_function_privilege('anon', 'public.set_stadium_live_preferences_updated_at()', 'EXECUTE'),
  false,
  'anon cannot execute the stadium preferences trigger function'
);
select is(
  has_function_privilege('anon', 'public.is_stadium_live_match_open(uuid,timestamptz)', 'EXECUTE'),
  false,
  'anon cannot execute the match-window helper'
);
select is(
  has_function_privilege('anon', 'public.is_stadium_live_blocked(uuid,uuid)', 'EXECUTE'),
  false,
  'anon cannot execute the block helper'
);
select is(
  has_function_privilege('anon', 'public.get_stadium_live_preferences()', 'EXECUTE'),
  false,
  'anon cannot read stadium preferences'
);
select is(
  has_function_privilege('anon', 'public.update_stadium_live_preferences(boolean,boolean,text)', 'EXECUTE'),
  false,
  'anon cannot update stadium preferences'
);
select is(
  has_function_privilege('anon', 'public.get_match_checkin_snapshot(uuid)', 'EXECUTE'),
  false,
  'anon cannot read a match check-in snapshot'
);
select is(
  has_function_privilege('anon', 'public.get_stadium_live_count(uuid)', 'EXECUTE'),
  false,
  'anon cannot read the stadium count RPC'
);
select is(
  has_function_privilege('anon', 'public.get_stadium_live_participants(uuid,integer,uuid,integer)', 'EXECUTE'),
  false,
  'anon cannot read the stadium participant directory'
);
select is(
  has_function_privilege('anon', 'public.send_stadium_reaction(uuid,uuid,text,uuid)', 'EXECUTE'),
  false,
  'anon cannot send stadium reactions'
);
select is(
  has_function_privilege('anon', 'public.get_stadium_reactions(uuid,timestamptz,uuid,integer)', 'EXECUTE'),
  false,
  'anon cannot read stadium reactions'
);

select is(
  has_function_privilege('authenticated', 'public.set_stadium_live_preferences_updated_at()', 'EXECUTE'),
  false,
  'authenticated cannot execute the trigger function directly'
);
select is(
  has_function_privilege('authenticated', 'public.is_stadium_live_match_open(uuid,timestamptz)', 'EXECUTE'),
  false,
  'authenticated cannot execute the internal match-window helper directly'
);
select is(
  has_function_privilege('authenticated', 'public.is_stadium_live_blocked(uuid,uuid)', 'EXECUTE'),
  true,
  'authenticated retains the block helper privilege required by reaction RLS'
);
select is(
  has_function_privilege('authenticated', 'public.get_stadium_live_preferences()', 'EXECUTE'),
  true,
  'authenticated can read stadium preferences'
);
select is(
  has_function_privilege('authenticated', 'public.update_stadium_live_preferences(boolean,boolean,text)', 'EXECUTE'),
  true,
  'authenticated can update stadium preferences'
);
select is(
  has_function_privilege('authenticated', 'public.get_match_checkin_snapshot(uuid)', 'EXECUTE'),
  true,
  'authenticated can read a match check-in snapshot'
);
select is(
  has_function_privilege('authenticated', 'public.get_stadium_live_count(uuid)', 'EXECUTE'),
  true,
  'authenticated can read the stadium count RPC'
);
select is(
  has_function_privilege('authenticated', 'public.get_stadium_live_participants(uuid,integer,uuid,integer)', 'EXECUTE'),
  true,
  'authenticated can read the stadium participant directory'
);
select is(
  has_function_privilege('authenticated', 'public.send_stadium_reaction(uuid,uuid,text,uuid)', 'EXECUTE'),
  true,
  'authenticated can send stadium reactions'
);
select is(
  has_function_privilege('authenticated', 'public.get_stadium_reactions(uuid,timestamptz,uuid,integer)', 'EXECUTE'),
  true,
  'authenticated can read stadium reactions'
);

with stadium_functions(function_oid) as (
  select unnest(array[
    'public.set_stadium_live_preferences_updated_at()'::regprocedure,
    'public.is_stadium_live_match_open(uuid,timestamptz)'::regprocedure,
    'public.is_stadium_live_blocked(uuid,uuid)'::regprocedure,
    'public.get_stadium_live_preferences()'::regprocedure,
    'public.update_stadium_live_preferences(boolean,boolean,text)'::regprocedure,
    'public.get_match_checkin_snapshot(uuid)'::regprocedure,
    'public.get_stadium_live_count(uuid)'::regprocedure,
    'public.get_stadium_live_participants(uuid,integer,uuid,integer)'::regprocedure,
    'public.send_stadium_reaction(uuid,uuid,text,uuid)'::regprocedure,
    'public.get_stadium_reactions(uuid,timestamptz,uuid,integer)'::regprocedure
  ])
)
select is(
  (
    select count(*)::integer
    from stadium_functions target
    join pg_proc function_row on function_row.oid = target.function_oid
    cross join lateral aclexplode(
      coalesce(function_row.proacl, acldefault('f', function_row.proowner))
    ) privilege
    where privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  'PUBLIC has no execute privilege on any Stadium Live function'
);

with stadium_functions(function_oid) as (
  select unnest(array[
    'public.set_stadium_live_preferences_updated_at()'::regprocedure,
    'public.is_stadium_live_match_open(uuid,timestamptz)'::regprocedure,
    'public.is_stadium_live_blocked(uuid,uuid)'::regprocedure,
    'public.get_stadium_live_preferences()'::regprocedure,
    'public.update_stadium_live_preferences(boolean,boolean,text)'::regprocedure,
    'public.get_match_checkin_snapshot(uuid)'::regprocedure,
    'public.get_stadium_live_count(uuid)'::regprocedure,
    'public.get_stadium_live_participants(uuid,integer,uuid,integer)'::regprocedure,
    'public.send_stadium_reaction(uuid,uuid,text,uuid)'::regprocedure,
    'public.get_stadium_reactions(uuid,timestamptz,uuid,integer)'::regprocedure
  ])
)
select is(
  (
    select count(*)::integer
    from stadium_functions target
    where has_function_privilege('service_role', target.function_oid, 'EXECUTE')
  ),
  0,
  'service_role has no unnecessary direct Stadium Live function privileges'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_like(
  $$ select public.is_stadium_live_blocked('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002') $$,
  '%permission denied for function is_stadium_live_blocked%',
  'anonymous block-helper invocation is rejected by PostgreSQL privileges'
);
reset role;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'stadium-a@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'stadium-b@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('c3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'stadium-c@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('d4000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'stadium-d@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('e5000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'stadium-e@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('f6000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'stadium-f@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name, username)
values
  ('a1000000-0000-4000-8000-000000000001', 'Alpha Fan', 'alpha-fan'),
  ('b2000000-0000-4000-8000-000000000002', 'Beta Fan', 'beta-fan'),
  ('c3000000-0000-4000-8000-000000000003', 'Hidden Fan', 'hidden-fan'),
  ('d4000000-0000-4000-8000-000000000004', 'Blocked Fan', 'blocked-fan'),
  ('e5000000-0000-4000-8000-000000000005', 'Echo Fan', 'echo-fan'),
  ('f6000000-0000-4000-8000-000000000006', 'Unchecked Fan', 'unchecked-fan');

insert into public.fixtures (
  id, provider, provider_fixture_id, kickoff_at, home_team, away_team
)
values (
  '10000000-0000-4000-8000-000000000010',
  'test',
  'stadium-live-pgtap',
  now(),
  'FC Nordsjælland',
  'Testmodstander'
);

insert into public.match_checkins (match_id, user_id)
select '10000000-0000-4000-8000-000000000010', id
from public.profiles
where id in (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000003',
  'd4000000-0000-4000-8000-000000000004',
  'e5000000-0000-4000-8000-000000000005'
);

insert into public.stadium_live_preferences (user_id, is_visible, reactions_enabled, section_label)
values
  ('a1000000-0000-4000-8000-000000000001', false, true, null),
  ('b2000000-0000-4000-8000-000000000002', true, true, 'A-tribunen'),
  ('c3000000-0000-4000-8000-000000000003', false, true, null),
  ('d4000000-0000-4000-8000-000000000004', true, true, null),
  ('e5000000-0000-4000-8000-000000000005', true, true, null);

insert into public.communities (id, name, created_by)
values ('20000000-0000-4000-8000-000000000020', 'Stadium test community', 'a1000000-0000-4000-8000-000000000001');

insert into public.community_members (community_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000020', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000020', 'b2000000-0000-4000-8000-000000000002', 'member');

insert into public.user_blocks (blocker_id, blocked_id)
values ('a1000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000004');

create temporary table stadium_test_state (
  reaction_id uuid,
  reply_id uuid
);
grant select, insert, update on stadium_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select is_visible from public.get_stadium_live_preferences()),
  false,
  'visibility defaults to false without creating a preference row'
);
select is(
  (select reactions_enabled from public.get_stadium_live_preferences()),
  true,
  'reactions default to true'
);
select throws_like(
  $$ select * from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') $$,
  '%Check ind til kampen%',
  'unchecked users cannot query the participant directory'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.update_stadium_live_preferences(true, true, E'  Nedre\n  C  ') $$,
  'checked-in user can opt in through the RPC'
);
select is(
  (select is_visible from public.get_stadium_live_preferences()),
  true,
  'opt-in is persisted'
);
select is(
  (select section_label from public.get_stadium_live_preferences()),
  'Nedre C',
  'section label is sanitized and whitespace-normalized'
);
select is(
  jsonb_array_length(public.get_match_checkin_snapshot('10000000-0000-4000-8000-000000000010')->'profiles'),
  2,
  'visible checked-in callers receive only eligible other profiles'
);

select is(
  public.get_stadium_live_count('10000000-0000-4000-8000-000000000010'),
  3,
  'visible count excludes hidden and blocked users'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010')),
  2,
  'directory returns only eligible other fans'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'a1000000-0000-4000-8000-000000000001'),
  0,
  'directory excludes self'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'c3000000-0000-4000-8000-000000000003'),
  0,
  'directory excludes hidden users'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'd4000000-0000-4000-8000-000000000004'),
  0,
  'directory excludes users blocked in either direction'
);
select is(
  (select user_id from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') order by rank_bucket, user_id limit 1),
  'b2000000-0000-4000-8000-000000000002'::uuid,
  'same-community fan ranks first'
);
select is(
  (select same_community from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'b2000000-0000-4000-8000-000000000002'),
  true,
  'directory returns only generic community affinity'
);
select is(
  (select rank_bucket from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'e5000000-0000-4000-8000-000000000005'),
  2,
  'other fans receive the stable final rank bucket'
);
select is(
  (select can_react from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'e5000000-0000-4000-8000-000000000005'),
  true,
  'recipient reaction preference is exposed only as an action flag'
);

select lives_ok(
  $$
    insert into stadium_test_state (reaction_id)
    select reaction_id
    from public.send_stadium_reaction(
      '10000000-0000-4000-8000-000000000010',
      'b2000000-0000-4000-8000-000000000002',
      'high_five'
    )
  $$,
  'eligible fan can send an allowlisted reaction'
);

reset role;
select is(
  (select count(*)::integer from public.social_reactions where id = (select reaction_id from stadium_test_state)),
  1,
  'reaction is durably persisted'
);
select is(
  (select count(*)::integer from public.notification_jobs where source_id = (select reaction_id from stadium_test_state) and notification_type = 'stadium_reaction'),
  1,
  'reaction transaction creates one v2 outbox job'
);
select is(
  (select count(*)::integer from public.notifications where entity_id = (select reaction_id from stadium_test_state) and type = 'stadium_reaction'),
  1,
  'reaction is mirrored into the notification bell'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.social_reactions where id = (select reaction_id from stadium_test_state)),
  1,
  'reaction participants can read their own realtime row through RLS'
);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000002', 'cheers') $$,
  '%Vent lidt%',
  'same-recipient cooldown is enforced server-side'
);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000001', 'high_five') $$,
  '%dig selv%',
  'self reactions are rejected'
);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'c3000000-0000-4000-8000-000000000003', 'high_five') $$,
  '%kan ikke modtage%',
  'hidden recipients cannot receive reactions'
);

reset role;
update public.stadium_live_preferences
set reactions_enabled = false
where user_id = 'e5000000-0000-4000-8000-000000000005';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'e5000000-0000-4000-8000-000000000005', 'heart') $$,
  '%kan ikke modtage%',
  'recipient can disable stadium reactions without hiding'
);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'd4000000-0000-4000-8000-000000000004', 'high_five') $$,
  '%kan ikke sendes%',
  'blocked recipient cannot receive a reaction'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$
    update stadium_test_state
    set reply_id = sent.reaction_id
    from public.send_stadium_reaction(
      '10000000-0000-4000-8000-000000000010',
      'a1000000-0000-4000-8000-000000000001',
      'high_five',
      (select reaction_id from stadium_test_state)
    ) sent
  $$,
  'recipient can reply to the original actor with one tap'
);

reset role;
select is(
  (select reply_to_reaction_id from public.social_reactions where id = (select reply_id from stadium_test_state)),
  (select reaction_id from stadium_test_state),
  'reply retains the validated original reaction reference'
);

insert into public.social_reactions (
  actor_id, recipient_user_id, context_type, context_id, reaction_type
)
values (
  'e5000000-0000-4000-8000-000000000005',
  'b2000000-0000-4000-8000-000000000002',
  'stadium',
  '10000000-0000-4000-8000-000000000010',
  'laugh'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.get_stadium_reactions('10000000-0000-4000-8000-000000000010')),
  2,
  'recent reactions returns only caller-related rows'
);
select throws_like(
  $$ insert into public.social_reactions (actor_id, recipient_user_id, context_type, context_id, reaction_type) values ('a1000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000005', 'stadium', '10000000-0000-4000-8000-000000000010', 'laugh') $$,
  '%permission denied%',
  'client cannot spoof the reaction actor with a direct insert'
);

reset role;
update public.stadium_live_preferences
set reactions_enabled = true
where user_id = 'e5000000-0000-4000-8000-000000000005';
insert into public.user_blocks (blocker_id, blocked_id)
values ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.get_stadium_reactions('10000000-0000-4000-8000-000000000010')),
  0,
  'stored reactions are hidden after either user blocks the other'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'b2000000-0000-4000-8000-000000000002'),
  0,
  'directory reconciles a new reverse-direction block'
);

reset role;
insert into public.social_reactions (
  actor_id,
  recipient_user_id,
  context_type,
  context_id,
  reaction_type,
  created_at
)
select
  'a1000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000005',
  'stadium',
  '10000000-0000-4000-8000-000000000010',
  'fire',
  now() - interval '31 seconds'
from generate_series(1, 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'e5000000-0000-4000-8000-000000000005', 'fire') $$,
  '%mange reaktioner%',
  'global twenty-per-five-minute rate limit is enforced server-side'
);

reset role;
update public.stadium_live_preferences
set is_visible = false
where user_id = 'a1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  jsonb_array_length(public.get_match_checkin_snapshot('10000000-0000-4000-8000-000000000010')->'profiles'),
  0,
  'hidden checked-in callers cannot use the snapshot RPC as a participant-directory bypass'
);

reset role;
update public.fixtures
set kickoff_at = now() - interval '7 hours'
where id = '10000000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.get_stadium_live_count('10000000-0000-4000-8000-000000000010'),
  0,
  'visible count closes outside the shared match window'
);

select * from finish();
rollback;
