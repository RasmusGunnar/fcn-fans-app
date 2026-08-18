begin;

select no_plan();

select col_type_is(
  'public',
  'match_checkins',
  'match_id',
  'uuid',
  'match_checkins.match_id uses the canonical fixture UUID type'
);
select has_function(
  'public',
  'set_match_checkin_status',
  array['uuid', 'boolean'],
  'canonical check-in/check-out RPC exists'
);
select is(
  has_table_privilege('authenticated', 'public.match_checkins', 'INSERT'),
  false,
  'authenticated clients cannot insert check-ins directly'
);
select is(
  has_table_privilege('authenticated', 'public.match_checkins', 'UPDATE'),
  false,
  'authenticated clients cannot update check-ins directly'
);
select is(
  has_table_privilege('authenticated', 'public.match_checkins', 'DELETE'),
  false,
  'authenticated clients cannot check out directly'
);
select is(
  has_table_privilege('authenticated', 'public.match_checkins', 'SELECT'),
  false,
  'authenticated clients read matchday state through RPCs only'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.set_match_checkin_status(uuid,boolean)',
    'EXECUTE'
  ),
  true,
  'authenticated users can execute the canonical mutation RPC'
);
select is(
  has_function_privilege('anon', 'public.set_match_checkin_status(uuid,boolean)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the mutation RPC'
);
select is(
  has_function_privilege('service_role', 'public.set_match_checkin_status(uuid,boolean)', 'EXECUTE'),
  false,
  'service_role has no unnecessary direct mutation RPC privilege'
);

with stadium_functions(function_oid) as (
  select unnest(array[
    'public.get_match_checkin_snapshot(uuid)'::regprocedure,
    'public.set_match_checkin_status(uuid,boolean)'::regprocedure,
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
  'PUBLIC has no execute privilege on Stadium Live RPCs'
);

with stadium_functions(function_oid) as (
  select unnest(array[
    'public.get_match_checkin_snapshot(uuid)'::regprocedure,
    'public.set_match_checkin_status(uuid,boolean)'::regprocedure,
    'public.get_stadium_live_count(uuid)'::regprocedure,
    'public.get_stadium_live_participants(uuid,integer,uuid,integer)'::regprocedure,
    'public.send_stadium_reaction(uuid,uuid,text,uuid)'::regprocedure
  ])
)
select is(
  (
    select count(*)::integer
    from stadium_functions target
    join pg_proc function_row on function_row.oid = target.function_oid
    where function_row.proconfig @> array['search_path=public']
  ),
  5,
  'all repaired security-definer Stadium RPCs have a fixed search_path'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'stadium-a@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'stadium-b@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('c3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'stadium-c@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('d4000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'stadium-d@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name, username)
values
  ('a1000000-0000-4000-8000-000000000001', 'Alpha Fan', 'alpha-fan'),
  ('b2000000-0000-4000-8000-000000000002', 'Beta Fan', 'beta-fan'),
  ('c3000000-0000-4000-8000-000000000003', 'Charlie Fan', 'charlie-fan'),
  ('d4000000-0000-4000-8000-000000000004', 'Delta Fan', 'delta-fan');

insert into public.fixtures (
  id, provider, provider_fixture_id, kickoff_at, home_team, away_team
)
values (
  '10000000-0000-4000-8000-000000000010',
  'test',
  'stadium-live-repair-pgtap',
  now(),
  'FC Nordsjælland',
  'Testmodstander'
);

insert into public.communities (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000020',
  'Stadium test community',
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.community_members (community_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000020', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000020', 'b2000000-0000-4000-8000-000000000002', 'member');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.set_match_checkin_status('10000000-0000-4000-8000-000000000010', true) $$,
  'authenticated user can check themselves in through the RPC'
);
select is(
  public.get_match_checkin_snapshot('10000000-0000-4000-8000-000000000010')->>'is_checked_in',
  'true',
  'check-in is immediately reflected in the canonical snapshot'
);
select is(
  (public.get_match_checkin_snapshot('10000000-0000-4000-8000-000000000010')->>'participant_count')::integer,
  1,
  'participant count includes the checked-in caller'
);
select is(
  (select is_visible from public.get_stadium_live_preferences()),
  true,
  'check-in automatically records backwards-compatible Stadium visibility consent'
);
select is(
  (select reactions_enabled from public.get_stadium_live_preferences()),
  true,
  'check-in automatically enables Stadium reactions'
);
select throws_like(
  $$ insert into public.match_checkins (match_id, user_id) values ('10000000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000002') $$,
  '%permission denied%',
  'a user cannot check another user in through direct table access'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ select public.set_match_checkin_status('10000000-0000-4000-8000-000000000010', true) $$,
  'a second authenticated user can check themselves in'
);

reset role;
update public.stadium_live_preferences
set is_visible = false
where user_id = 'b2000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') $$,
  'participant directory executes without a text = uuid error'
);
select is(
  public.get_stadium_live_count('10000000-0000-4000-8000-000000000010'),
  2,
  'Stadium count equals all active match_checkins'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010')),
  1,
  'directory returns the other active checked-in fan'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'a1000000-0000-4000-8000-000000000001'),
  0,
  'directory never returns the caller'
);
select is(
  (select same_community from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'b2000000-0000-4000-8000-000000000002'),
  true,
  'same-community relation is evaluated with canonical UUID columns'
);
select is(
  (select rank_bucket from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'b2000000-0000-4000-8000-000000000002'),
  0,
  'same-community participant ranks before other fans'
);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'b2000000-0000-4000-8000-000000000002'),
  1,
  'legacy is_visible=false does not hide an active checked-in participant'
);

select lives_ok(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000002', 'high_five') $$,
  'checked-in users can send an allowlisted Stadium reaction'
);

reset role;
select is(
  (select count(*)::integer from public.social_reactions where actor_id = 'a1000000-0000-4000-8000-000000000001' and recipient_user_id = 'b2000000-0000-4000-8000-000000000002'),
  1,
  'reaction is persisted by the RPC'
);
select is(
  (select count(*)::integer from public.notification_jobs where notification_type = 'stadium_reaction' and recipient_user_id = 'b2000000-0000-4000-8000-000000000002'),
  1,
  'reaction creates a notification outbox job'
);
select is(
  (select count(*)::integer from public.notifications where type = 'stadium_reaction' and user_id = 'b2000000-0000-4000-8000-000000000002'),
  1,
  'reaction appears in the notification center'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$ select * from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') $$,
  '%Check ind%',
  'non-checked-in user cannot read the participant directory'
);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000001', 'heart') $$,
  '%checket ind%',
  'non-checked-in actor cannot send a Stadium reaction'
);

reset role;
update public.stadium_live_preferences
set reactions_enabled = false
where user_id = 'b2000000-0000-4000-8000-000000000002';
delete from public.social_reactions
where actor_id = 'a1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000002', 'heart') $$,
  '%kan ikke modtage%',
  'recipient reaction preference remains enforceable without hiding the participant'
);

reset role;
update public.stadium_live_preferences
set reactions_enabled = true
where user_id = 'b2000000-0000-4000-8000-000000000002';
insert into public.user_blocks (blocker_id, blocked_id)
values ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.get_stadium_live_participants('10000000-0000-4000-8000-000000000010') where user_id = 'b2000000-0000-4000-8000-000000000002'),
  0,
  'reverse-direction block hides a participant'
);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000002', 'fire') $$,
  '%kan ikke sendes%',
  'block rules deny Stadium reactions in either direction'
);

reset role;
delete from public.user_blocks
where blocker_id = 'b2000000-0000-4000-8000-000000000002'
  and blocked_id = 'a1000000-0000-4000-8000-000000000001';
insert into public.social_reactions (
  actor_id, recipient_user_id, context_type, context_id, reaction_type, created_at
)
select
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'stadium',
  '10000000-0000-4000-8000-000000000010',
  'fire',
  now() - interval '31 seconds'
from generate_series(1, 20);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$ select * from public.send_stadium_reaction('10000000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000002', 'laugh') $$,
  '%mange reaktioner%',
  'twenty-per-five-minute Stadium reaction rate limit is preserved'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ select public.set_match_checkin_status('10000000-0000-4000-8000-000000000010', false) $$,
  'checked-in user can check themselves out through the RPC'
);
select is(
  public.get_match_checkin_snapshot('10000000-0000-4000-8000-000000000010')->>'is_checked_in',
  'false',
  'check-out immediately clears checked-in state'
);
select is(
  public.get_stadium_live_count('10000000-0000-4000-8000-000000000010'),
  1,
  'check-out removes the user from the canonical participant count'
);
select is(
  (select is_visible from public.get_stadium_live_preferences()),
  false,
  'check-out clears backwards-compatible visibility state'
);

reset role;
select ok(
  public.is_stadium_live_match_open(
    '10000000-0000-4000-8000-000000000010',
    (select kickoff_at - interval '6 hours' from public.fixtures where id = '10000000-0000-4000-8000-000000000010')
  ),
  'Stadium window includes exactly six hours before kickoff'
);
select is(
  public.is_stadium_live_match_open(
    '10000000-0000-4000-8000-000000000010',
    (select kickoff_at - interval '6 hours 1 second' from public.fixtures where id = '10000000-0000-4000-8000-000000000010')
  ),
  false,
  'Stadium window is closed before the six-hour boundary'
);
select ok(
  public.is_stadium_live_match_open(
    '10000000-0000-4000-8000-000000000010',
    (select kickoff_at + interval '6 hours' from public.fixtures where id = '10000000-0000-4000-8000-000000000010')
  ),
  'Stadium window includes exactly six hours after kickoff'
);
select is(
  public.is_stadium_live_match_open(
    '10000000-0000-4000-8000-000000000010',
    (select kickoff_at + interval '6 hours 1 second' from public.fixtures where id = '10000000-0000-4000-8000-000000000010')
  ),
  false,
  'Stadium window is closed after the six-hour boundary'
);

update public.fixtures
set kickoff_at = now() - interval '7 hours'
where id = '10000000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$ select public.set_match_checkin_status('10000000-0000-4000-8000-000000000010', true) $$,
  '%ikke åbent%',
  'check-in is denied outside the shared Stadium window'
);
select is(
  public.get_stadium_live_count('10000000-0000-4000-8000-000000000010'),
  0,
  'canonical participant count is closed outside the match window'
);

select * from finish();
rollback;
