begin;

select plan(64);

select has_column('public', 'conversations', 'conversation_type', 'conversation type exists');
select has_column('public', 'conversations', 'name', 'group name exists');
select has_column('public', 'conversation_members', 'role', 'member role exists');
select has_column('public', 'conversation_members', 'left_at', 'leave timestamp exists');
select has_column('public', 'conversation_members', 'removed_at', 'removal timestamp exists');
select has_column('public', 'messages', 'message_type', 'message type exists');
select has_column('public', 'messages', 'media_path', 'message media path exists');
select has_column('public', 'direct_message_reports', 'report_target_type', 'report target exists');
select hasnt_column('public', 'direct_message_reports', 'body', 'group reports remain metadata-only');
select has_function('public', 'create_group_conversation', array['text', 'uuid[]'], 'group creation RPC exists');
select has_function(
  'public',
  'send_message',
  array['uuid', 'text', 'uuid', 'text', 'text', 'text', 'integer', 'integer', 'bigint'],
  'generic send RPC exists'
);
select has_function(
  'public',
  'update_group_member_role',
  array['uuid', 'uuid', 'text'],
  'owner role RPC exists'
);
select is(
  (select public from storage.buckets where id = 'message-media'),
  false,
  'message media bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'message-media'),
  10485760::bigint,
  'message media bucket is limited to 10 MB'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'message media read active member'),
  1,
  'private media read policy exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'message media upload own active member'),
  1,
  'private media upload policy exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'conversation members receive typing'),
  1,
  'private typing read policy exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'conversation members send typing'),
  1,
  'private typing send policy exists'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select
  ('a0000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'dm-v15-' || value::text || '@example.test',
  '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
from generate_series(1, 12) value;

insert into public.profiles (id, display_name, username)
select
  ('a0000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'V15 Fan ' || value::text,
  'v15-fan-' || value::text
from generate_series(1, 12) value;

create temporary table dm_v15_state (
  group_id uuid,
  duplicate_group_id uuid,
  text_message_id uuid,
  blocked_message_id uuid,
  image_message_id uuid
);
insert into dm_v15_state default values;
grant select, update on dm_v15_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    update dm_v15_state
    set group_id = public.create_group_conversation(
      'Udebaneturen',
      array[
        'a0000000-0000-4000-8000-000000000002'::uuid,
        'a0000000-0000-4000-8000-000000000003'::uuid
      ]
    )
  $$,
  'creator can create a three-member group'
);
select is(
  (select conversation_type from public.conversations where id = (select group_id from dm_v15_state)),
  'group',
  'created conversation is a group'
);
select is(
  (
    select role from public.conversation_members
    where conversation_id = (select group_id from dm_v15_state)
      and user_id = auth.uid()
  ),
  'owner',
  'creator starts as owner'
);
select is(
  (
    select count(*)::integer from public.conversation_members
    where conversation_id = (select group_id from dm_v15_state)
      and left_at is null and removed_at is null
  ),
  3,
  'group starts with three active members'
);
select lives_ok(
  $$
    update dm_v15_state
    set duplicate_group_id = public.create_group_conversation(
      'Dubletter',
      array[
        'a0000000-0000-4000-8000-000000000002'::uuid,
        'a0000000-0000-4000-8000-000000000002'::uuid
      ]
    )
  $$,
  'duplicate member ids are accepted safely'
);
select is(
  (
    select count(*)::integer from public.conversation_members
    where conversation_id = (select duplicate_group_id from dm_v15_state)
  ),
  2,
  'duplicate ids create only one member row'
);
select throws_like(
  $$
    select public.create_group_conversation(
      'For stor',
      array[
        'a0000000-0000-4000-8000-000000000002'::uuid,
        'a0000000-0000-4000-8000-000000000003'::uuid,
        'a0000000-0000-4000-8000-000000000004'::uuid,
        'a0000000-0000-4000-8000-000000000005'::uuid,
        'a0000000-0000-4000-8000-000000000006'::uuid,
        'a0000000-0000-4000-8000-000000000007'::uuid,
        'a0000000-0000-4000-8000-000000000008'::uuid,
        'a0000000-0000-4000-8000-000000000009'::uuid,
        'a0000000-0000-4000-8000-000000000010'::uuid,
        'a0000000-0000-4000-8000-000000000011'::uuid
      ]
    )
  $$,
  '%group_member_count_invalid%',
  'more than ten total members is rejected'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.conversations where id = (select group_id from dm_v15_state)),
  1,
  'active member can read the group'
);
select lives_ok(
  $$
    update dm_v15_state
    set text_message_id = sent.message_id
    from public.send_message(
      (select group_id from dm_v15_state),
      'Hej gruppe',
      'b0000000-0000-4000-8000-000000000001',
      'text', null, null, null, null, null
    ) sent
  $$,
  'active member can send a group text'
);
select is(
  (select count(*)::integer from public.messages where id = (select text_message_id from dm_v15_state)),
  1,
  'group text is persisted once'
);
select throws_like(
  $$ select public.remove_group_member(
    (select group_id from dm_v15_state),
    'a0000000-0000-4000-8000-000000000003'
  ) $$,
  '%group_admin_required%',
  'ordinary member cannot remove another member'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.get_direct_message_unread_count(), 1, 'group message contributes to unread');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.conversations where id = (select group_id from dm_v15_state)),
  0,
  'non-member cannot read group metadata'
);
select throws_like(
  $$
    select * from public.send_message(
      (select group_id from dm_v15_state), 'Uautoriseret',
      'b0000000-0000-4000-8000-000000000002',
      'text', null, null, null, null, null
    )
  $$,
  '%direct_message_conversation_not_found%',
  'non-member cannot send to group'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ select public.add_group_members(
    (select group_id from dm_v15_state),
    array['a0000000-0000-4000-8000-000000000004'::uuid]
  ) $$,
  'owner can add a member'
);
select is(
  (
    select count(*)::integer from public.conversation_members
    where conversation_id = (select group_id from dm_v15_state)
      and left_at is null and removed_at is null
  ),
  4,
  'added member becomes active'
);
select lives_ok(
  $$ select public.update_group_member_role(
    (select group_id from dm_v15_state),
    'a0000000-0000-4000-8000-000000000002',
    'admin'
  ) $$,
  'owner can promote a member to admin'
);
select is(
  (
    select role from public.conversation_members
    where conversation_id = (select group_id from dm_v15_state)
      and user_id = 'a0000000-0000-4000-8000-000000000002'
  ),
  'admin',
  'promoted member has admin role'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ select public.add_group_members(
    (select group_id from dm_v15_state),
    array['a0000000-0000-4000-8000-000000000005'::uuid]
  ) $$,
  'admin can add an ordinary member'
);
select lives_ok(
  $$ select public.remove_group_member(
    (select group_id from dm_v15_state),
    'a0000000-0000-4000-8000-000000000004'
  ) $$,
  'admin can remove an ordinary member'
);
select throws_like(
  $$ select public.update_group_member_role(
    (select group_id from dm_v15_state),
    'a0000000-0000-4000-8000-000000000005',
    'admin'
  ) $$,
  '%group_role_forbidden%',
  'admin cannot promote another member'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.conversations where id = (select group_id from dm_v15_state)),
  0,
  'removed member immediately loses read access'
);
select throws_like(
  $$
    select * from public.send_message(
      (select group_id from dm_v15_state), 'Efter removal',
      'b0000000-0000-4000-8000-000000000003',
      'text', null, null, null, null, null
    )
  $$,
  '%direct_message_conversation_not_found%',
  'removed member cannot send'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ select public.leave_group((select group_id from dm_v15_state)) $$,
  'ordinary member can leave group'
);
select is(
  (select count(*)::integer from public.conversations where id = (select group_id from dm_v15_state)),
  0,
  'left member immediately loses read access'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$ select public.leave_group((select group_id from dm_v15_state)) $$,
  '%group_owner_cannot_leave%',
  'owner cannot leave without ownership transfer'
);
select lives_ok(
  $$ select public.set_direct_message_block(
    'a0000000-0000-4000-8000-000000000002', true
  ) $$,
  'owner can block another group member at user level'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$
    update dm_v15_state
    set blocked_message_id = sent.message_id
    from public.send_message(
      (select group_id from dm_v15_state),
      'Gruppen virker stadig',
      'b0000000-0000-4000-8000-000000000004',
      'text', null, null, null, null, null
    ) sent
  $$,
  'user block does not prevent group send'
);
select lives_ok(
  $$
    update dm_v15_state
    set image_message_id = sent.message_id
    from public.send_message(
      (select group_id from dm_v15_state),
      null,
      'b0000000-0000-4000-8000-000000000005',
      'image',
      (select group_id::text from dm_v15_state)
        || '/a0000000-0000-4000-8000-000000000002/'
        || 'c0000000-0000-4000-8000-000000000001.jpg',
      'image/jpeg', 1200, 800, 2048
    ) sent
  $$,
  'active member can send a valid image message'
);
select is(
  (select message_type from public.messages where id = (select image_message_id from dm_v15_state)),
  'image',
  'valid image message keeps its type'
);
select throws_like(
  $$
    select * from public.send_message(
      (select group_id from dm_v15_state), null,
      'b0000000-0000-4000-8000-000000000006',
      'image', null, 'image/jpeg', 1200, 800, 2048
    )
  $$,
  '%messages_content_check%',
  'image message without a path is rejected'
);
select throws_like(
  $$
    select * from public.send_message(
      (select group_id from dm_v15_state), null,
      'b0000000-0000-4000-8000-000000000007',
      'image',
      (select group_id::text from dm_v15_state)
        || '/a0000000-0000-4000-8000-000000000002/'
        || 'c0000000-0000-4000-8000-000000000002.jpg',
      'image/jpeg', 1200, 800, 10485761
    )
  $$,
  '%messages_media_size_check%',
  'oversized image metadata is rejected'
);
select lives_ok(
  $$ select public.report_conversation(
    (select group_id from dm_v15_state),
    'conversation', null, 'spam', 'Metadata only'
  ) $$,
  'member can report the group without a transcript'
);
select is(
  (
    select report_target_type from public.direct_message_reports
    where conversation_id = (select group_id from dm_v15_state)
      and reporter_id = auth.uid()
  ),
  'conversation',
  'group report stores conversation target metadata'
);
select is(public.get_direct_message_unread_count(), 0, 'own group messages are excluded from unread');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.get_direct_message_unread_count(), 3, 'owner sees all three incoming group messages unread');
select lives_ok(
  $$ select public.mark_conversation_read(
    (select group_id from dm_v15_state),
    (select image_message_id from dm_v15_state)
  ) $$,
  'generic read pointer advances through group messages'
);
select is(public.get_direct_message_unread_count(), 0, 'group unread clears after read pointer advances');

reset role;
select is(
  (
    select count(*)::integer from public.notification_jobs job
    join public.messages message on message.id = job.source_id
    where message.conversation_id = (select group_id from dm_v15_state)
      and job.notification_type = 'direct_message'
  ),
  6,
  'three group messages fan out to two active recipients each'
);
select is(
  (
    select count(*)::integer from public.notification_jobs job
    join public.messages message on message.id = job.source_id
    where message.conversation_id = (select group_id from dm_v15_state)
      and job.recipient_user_id = message.sender_id
  ),
  0,
  'group outbox never targets the sender'
);
select is(
  (
    select count(*)::integer from public.notification_jobs job
    join public.messages message on message.id = job.source_id
    where message.conversation_id = (select group_id from dm_v15_state)
      and job.recipient_user_id in (
        'a0000000-0000-4000-8000-000000000004',
        'a0000000-0000-4000-8000-000000000005'
      )
  ),
  0,
  'removed and left members receive no later jobs'
);
select is(
  (
    select count(*)::integer from (
      select dedupe_key
      from public.notification_jobs
      where dedupe_key like 'direct_message:%'
      group by dedupe_key
      having count(*) > 1
    ) duplicate_keys
  ),
  0,
  'message-recipient outbox dedupe keys remain unique'
);
select is(
  (
    select count(*)::integer from pg_indexes
    where schemaname = 'public'
      and indexname = 'conversations_direct_pair_unique'
      and indexdef like '%WHERE (conversation_type = ''direct''::text)%'
  ),
  1,
  'canonical pair uniqueness is partial to direct conversations'
);
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'),
  1,
  'generic messages remain in realtime publication'
);

delete from auth.users where id = 'a0000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.conversations where id = (select group_id from dm_v15_state)),
  1,
  'owner account deletion preserves a group with active members'
);
select is(
  (
    select count(*)::integer from public.conversation_members
    where conversation_id = (select group_id from dm_v15_state)
      and role = 'owner' and left_at is null and removed_at is null
  ),
  1,
  'owner account deletion transfers exactly one owner role'
);

select * from finish();
rollback;
