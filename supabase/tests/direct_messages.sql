begin;

select plan(45);

select has_table('public', 'conversations', 'conversations table exists');
select has_table('public', 'conversation_members', 'conversation_members table exists');
select has_table('public', 'messages', 'messages table exists');
select has_table('public', 'user_blocks', 'user_blocks table exists');
select has_table('public', 'direct_message_reports', 'direct_message_reports table exists');
select hasnt_column('public', 'direct_message_reports', 'body', 'reports contain no message body');
select is(
  has_table_privilege('authenticated', 'public.conversations', 'insert'),
  false,
  'authenticated cannot insert conversations directly'
);
select is(
  has_table_privilege('authenticated', 'public.messages', 'insert'),
  false,
  'authenticated cannot insert messages directly'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  (
    '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'dm-a@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    '92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'dm-b@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    '93000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'dm-c@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  );

insert into public.profiles (id)
values
  ('91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002'),
  ('93000000-0000-4000-8000-000000000003');

update public.profiles set display_name = 'Alpha Fan', username = 'alpha-fan'
where id = '91000000-0000-4000-8000-000000000001';
update public.profiles set display_name = 'Beta Fan', username = 'beta-fan'
where id = '92000000-0000-4000-8000-000000000002';
update public.profiles set display_name = 'Charlie Fan', username = 'charlie-fan'
where id = '93000000-0000-4000-8000-000000000003';

create temporary table dm_test_state (
  conversation_id uuid,
  first_message_id uuid,
  second_message_id uuid
);
grant select, insert, update on dm_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_like(
  $$ select public.create_or_get_direct_conversation('91000000-0000-4000-8000-000000000001') $$,
  '%direct_message_self_conversation%',
  'self conversation is rejected'
);

select lives_ok(
  $$
    insert into dm_test_state (conversation_id)
    select public.create_or_get_direct_conversation('92000000-0000-4000-8000-000000000002')
  $$,
  'participant can create a canonical conversation'
);

select ok(
  (
    select conversation.user_low_id < conversation.user_high_id
    from public.conversations conversation
    join dm_test_state state on state.conversation_id = conversation.id
  ),
  'conversation pair is canonically ordered'
);

select is(
  public.create_or_get_direct_conversation('92000000-0000-4000-8000-000000000002'),
  (select conversation_id from dm_test_state),
  'duplicate pair returns the existing conversation'
);

select is(
  (select count(*)::integer from public.conversation_members where conversation_id = (select conversation_id from dm_test_state)),
  2,
  'conversation has exactly two membership rows'
);

select throws_like(
  $$
    select * from public.send_direct_message(
      (select conversation_id from dm_test_state), '',
      'a1000000-0000-4000-8000-000000000001'
    )
  $$,
  '%direct_message_body_length%',
  'empty message body is rejected'
);

select throws_like(
  $$
    select * from public.send_direct_message(
      (select conversation_id from dm_test_state), repeat('x', 2001),
      'a1000000-0000-4000-8000-000000000002'
    )
  $$,
  '%direct_message_body_length%',
  'message body over 2000 characters is rejected'
);

select lives_ok(
  $$
    update dm_test_state
    set first_message_id = sent.message_id
    from public.send_direct_message(
      (select conversation_id from dm_test_state), 'Første besked',
      'a1000000-0000-4000-8000-000000000003'
    ) sent
  $$,
  'participant can send a message through the RPC'
);

select lives_ok(
  $$
    select * from public.send_direct_message(
      (select conversation_id from dm_test_state), 'Første besked',
      'a1000000-0000-4000-8000-000000000003'
    )
  $$,
  'retrying the same client message id succeeds idempotently'
);

select is(
  (
    select count(*)::integer from public.messages
    where sender_id = '91000000-0000-4000-8000-000000000001'
      and client_message_id = 'a1000000-0000-4000-8000-000000000003'
  ),
  1,
  'idempotent retry creates only one message'
);

select lives_ok(
  $$
    update dm_test_state
    set second_message_id = sent.message_id
    from public.send_direct_message(
      (select conversation_id from dm_test_state), 'Anden besked',
      'a1000000-0000-4000-8000-000000000004'
    ) sent
  $$,
  'a second message can be sent'
);

select is(public.get_direct_message_unread_count(), 0, 'own messages are not unread');
select is(
  (select count(*)::integer from public.search_direct_message_users('Alpha', 20)),
  0,
  'search excludes the authenticated user'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.get_direct_message_unread_count(), 2, 'peer sees both incoming messages unread');
select lives_ok(
  $$ select public.mark_direct_conversation_read((select conversation_id from dm_test_state), (select first_message_id from dm_test_state)) $$,
  'read pointer can advance to the first loaded message'
);
select is(public.get_direct_message_unread_count(), 1, 'marking the first message leaves the second unread');
select lives_ok(
  $$ select public.mark_direct_conversation_read((select conversation_id from dm_test_state), (select second_message_id from dm_test_state)) $$,
  'read pointer can advance to the second loaded message'
);
select is(public.get_direct_message_unread_count(), 0, 'all loaded peer messages are read');
select lives_ok(
  $$ select public.mark_direct_conversation_read((select conversation_id from dm_test_state), (select first_message_id from dm_test_state)) $$,
  'older read acknowledgements are accepted as no-ops'
);
select is(public.get_direct_message_unread_count(), 0, 'read pointer never regresses');
select lives_ok(
  $$
    select public.report_direct_message(
      (select conversation_id from dm_test_state),
      '91000000-0000-4000-8000-000000000001',
      'spam',
      'Metadata only'
    )
  $$,
  'participant can create a metadata-only report'
);
select is(
  (select count(*)::integer from public.direct_message_reports where reporter_id = auth.uid()),
  1,
  'report is stored once without a transcript'
);
select lives_ok(
  $$ select public.set_direct_message_block('91000000-0000-4000-8000-000000000001', true) $$,
  'participant can block the peer'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_like(
  $$ select public.create_or_get_direct_conversation('92000000-0000-4000-8000-000000000002') $$,
  '%direct_message_blocked%',
  'block in either direction prevents create-or-get'
);
select throws_like(
  $$
    select * from public.send_direct_message(
      (select conversation_id from dm_test_state), 'Blokeret',
      'a1000000-0000-4000-8000-000000000005'
    )
  $$,
  '%direct_message_blocked%',
  'block in either direction prevents send'
);
select is(
  (select count(*)::integer from public.search_direct_message_users('Beta', 20)),
  0,
  'search excludes blocked relationships'
);
select is(
  (select count(*)::integer from public.search_direct_message_users('Charlie', 20)),
  1,
  'search returns an unblocked public profile'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.conversations where id = (select conversation_id from dm_test_state)),
  0,
  'non-member cannot read the conversation'
);
select is(
  (select count(*)::integer from public.messages where conversation_id = (select conversation_id from dm_test_state)),
  0,
  'non-member cannot read messages'
);
select throws_like(
  $$
    select * from public.send_direct_message(
      (select conversation_id from dm_test_state), 'Uautoriseret',
      'a1000000-0000-4000-8000-000000000006'
    )
  $$,
  '%direct_message_conversation_not_found%',
  'non-member cannot send'
);

reset role;

select is(
  (
    select count(*)::integer
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'search_direct_message_users_%'
      and parameter_mode = 'OUT'
  ),
  6,
  'search RPC returns only six explicit public/result fields'
);
select is(
  (
    select count(*)::integer
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'search_direct_message_users_%'
      and parameter_mode = 'OUT'
      and parameter_name in ('email', 'expo_push_token', 'push_token')
  ),
  0,
  'search RPC exposes no email or push token output'
);
select is(
  (select count(*)::integer from public.notification_jobs where notification_type = 'direct_message'),
  2,
  'each inserted message has one durable direct-message job'
);
select is(
  (
    select count(*)::integer
    from public.notifications notification
    join public.notification_jobs job on job.id = notification.notification_job_id
    where job.notification_type = 'direct_message'
  ),
  0,
  'direct-message jobs do not create ordinary notification rows'
);
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'),
  1,
  'messages is in the realtime publication'
);
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'),
  1,
  'conversations is in the realtime publication'
);
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'),
  1,
  'conversation_members is in the realtime publication'
);

select * from finish();
rollback;
