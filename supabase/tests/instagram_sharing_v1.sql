begin;

select plan(32);

select has_column('public', 'messages', 'external_share', 'message attachment column exists');
select has_function(
  'public',
  'is_valid_instagram_external_share',
  array['jsonb'],
  'server-side Instagram validator exists'
);
select has_function(
  'public',
  'send_message_v2',
  array['uuid', 'text', 'uuid', 'text', 'text', 'text', 'integer', 'integer', 'bigint', 'jsonb'],
  'external-link send RPC exists'
);
select is(
  has_function_privilege('anon', 'public.is_valid_instagram_external_share(jsonb)', 'execute'),
  false,
  'anonymous users cannot call the validator'
);
select is(
  has_function_privilege(
    'anon',
    'public.send_message_v2(uuid,text,uuid,text,text,text,integer,integer,bigint,jsonb)',
    'execute'
  ),
  false,
  'anonymous users cannot call the send RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.send_message_v2(uuid,text,uuid,text,text,text,integer,integer,bigint,jsonb)',
    'execute'
  ),
  true,
  'authenticated users can call the send RPC'
);

select ok(
  public.is_valid_instagram_external_share(
    '{"provider":"instagram","canonical_url":"https://www.instagram.com/p/ABCDE_12/","display_url":"https://www.instagram.com/p/ABCDE_12/","resource_type":"post","external_id":"ABCDE_12"}'::jsonb
  ),
  'canonical Instagram post is valid'
);
select ok(
  public.is_valid_instagram_external_share(
    '{"provider":"instagram","canonical_url":"https://www.instagram.com/reel/FGHIJ_34/","display_url":"https://www.instagram.com/reel/FGHIJ_34/","resource_type":"reel","external_id":"FGHIJ_34"}'::jsonb
  ),
  'canonical Instagram reel is valid'
);
select ok(
  public.is_valid_instagram_external_share(
    '{"provider":"instagram","canonical_url":"https://www.instagram.com/fcnordsjaelland/","display_url":"https://www.instagram.com/fcnordsjaelland/","resource_type":"profile","external_id":"fcnordsjaelland"}'::jsonb
  ),
  'canonical Instagram profile is valid'
);
select is(
  public.is_valid_instagram_external_share(
    '{"provider":"instagram","canonical_url":"https://instagram.com.evil.test/p/ABCDE_12/","display_url":"https://instagram.com.evil.test/p/ABCDE_12/","resource_type":"post","external_id":"ABCDE_12"}'::jsonb
  ),
  false,
  'lookalike host is rejected'
);
select is(
  public.is_valid_instagram_external_share(
    '{"provider":"instagram","canonical_url":"https://www.instagram.com/p/ABCDE_12/?igsh=secret","display_url":"https://www.instagram.com/p/ABCDE_12/?igsh=secret","resource_type":"post","external_id":"ABCDE_12"}'::jsonb
  ),
  false,
  'non-canonical query data is rejected'
);
select is(
  public.is_valid_instagram_external_share(
    '{"provider":"instagram","canonical_url":"https://www.instagram.com/reel/FGHIJ_34/","display_url":"https://www.instagram.com/reel/FGHIJ_34/","resource_type":"profile","external_id":"FGHIJ_34"}'::jsonb
  ),
  false,
  'resource mismatch is rejected'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  (
    'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'instagram-a@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    'c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'instagram-b@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  ),
  (
    'c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'instagram-c@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  );

insert into public.profiles (id, display_name, username)
values
  ('c1000000-0000-4000-8000-000000000001', 'Instagram A', 'instagram-a'),
  ('c1000000-0000-4000-8000-000000000002', 'Instagram B', 'instagram-b'),
  ('c1000000-0000-4000-8000-000000000003', 'Instagram C', 'instagram-c');

create temporary table instagram_share_state (
  direct_id uuid,
  group_id uuid,
  direct_message_id uuid,
  group_message_id uuid
);
insert into instagram_share_state default values;
grant select, update on instagram_share_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.posts (author_id, text, link_preview)
    values (
      auth.uid(),
      '',
      '{"provider":"instagram","url":"https://www.instagram.com/p/ABCDE_12/","displayUrl":"https://www.instagram.com/p/ABCDE_12/","resourceType":"post","externalId":"ABCDE_12","siteName":"Instagram","title":"Opslag"}'::jsonb
    )
  $$,
  'authenticated author can create a validated Instagram feed post'
);
select throws_like(
  $$
    insert into public.posts (author_id, text, link_preview)
    values (
      auth.uid(),
      '',
      '{"provider":"instagram","url":"https://www.instagram.com.evil.test/p/ABCDE_12/","displayUrl":"https://www.instagram.com.evil.test/p/ABCDE_12/","resourceType":"post","externalId":"ABCDE_12"}'::jsonb
    )
  $$,
  '%posts_instagram_link_preview_check%',
  'feed constraint rejects a spoofed Instagram host'
);
select lives_ok(
  $$
    insert into public.posts (author_id, text, link_preview)
    values (
      auth.uid(),
      'Eksisterende generisk link',
      '{"provider":"generic","url":"https://example.test/article","title":"Artikel"}'::jsonb
    )
  $$,
  'existing non-Instagram post previews remain valid'
);
select lives_ok(
  $$
    delete from public.posts
    where author_id = auth.uid() and link_preview ->> 'provider' = 'instagram'
  $$,
  'deleting a post removes its same-row Instagram metadata normally'
);

select lives_ok(
  $$
    update instagram_share_state
    set direct_id = public.create_or_get_direct_conversation(
      'c1000000-0000-4000-8000-000000000002'
    ),
    group_id = public.create_group_conversation(
      'Instagram-gruppe',
      array['c1000000-0000-4000-8000-000000000002'::uuid]
    )
  $$,
  'sender creates direct and group destinations'
);
select lives_ok(
  $$
    update instagram_share_state
    set direct_message_id = sent.message_id
    from public.send_message_v2(
      (select direct_id from instagram_share_state),
      'Se dette opslag',
      'c2000000-0000-4000-8000-000000000001',
      'external_link_text', null, null, null, null, null,
      '{"provider":"instagram","canonical_url":"https://www.instagram.com/p/ABCDE_12/","display_url":"https://www.instagram.com/p/ABCDE_12/","resource_type":"post","external_id":"ABCDE_12"}'::jsonb
    ) sent
  $$,
  'participant sends an Instagram link to a direct conversation'
);
select is(
  (select external_share ->> 'canonical_url' from public.messages where id = (select direct_message_id from instagram_share_state)),
  'https://www.instagram.com/p/ABCDE_12/',
  'direct message stores only the canonical attachment URL'
);
select is(
  (select message_type from public.messages where id = (select direct_message_id from instagram_share_state)),
  'external_link_text',
  'direct message keeps the external-link-with-text type'
);
select ok(
  (
    select media_path is null and media_mime_type is null
    from public.messages where id = (select direct_message_id from instagram_share_state)
  ),
  'external-link message does not store Instagram media'
);
select lives_ok(
  $$
    select * from public.send_message_v2(
      (select direct_id from instagram_share_state),
      'Se dette opslag',
      'c2000000-0000-4000-8000-000000000001',
      'external_link_text', null, null, null, null, null,
      '{"provider":"instagram","canonical_url":"https://www.instagram.com/p/ABCDE_12/","display_url":"https://www.instagram.com/p/ABCDE_12/","resource_type":"post","external_id":"ABCDE_12"}'::jsonb
    )
  $$,
  'retrying the same external-link client id succeeds'
);
select is(
  (
    select count(*)::integer from public.messages
    where sender_id = auth.uid()
      and client_message_id = 'c2000000-0000-4000-8000-000000000001'
  ),
  1,
  'external-link retry is idempotent'
);
select is(
  (
    select external_share ->> 'resource_type'
    from public.get_conversation_messages((select direct_id from instagram_share_state))
    where id = (select direct_message_id from instagram_share_state)
  ),
  'post',
  'conversation reader returns attachment metadata'
);
select is(
  (
    select last_message_external_share ->> 'resource_type'
    from public.get_messages_inbox()
    where conversation_id = (select direct_id from instagram_share_state)
  ),
  'post',
  'inbox reader returns last-message attachment metadata'
);

reset role;
select is(
  (
    select body from public.notification_jobs
    where source_table = 'messages'
      and source_id = (select direct_message_id from instagram_share_state)
    limit 1
  ),
  'Sendte et Instagram-opslag',
  'direct push preview identifies the Instagram attachment without leaking its URL'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    update instagram_share_state
    set group_message_id = sent.message_id
    from public.send_message_v2(
      (select group_id from instagram_share_state),
      null,
      'c2000000-0000-4000-8000-000000000002',
      'external_link', null, null, null, null, null,
      '{"provider":"instagram","canonical_url":"https://www.instagram.com/reel/FGHIJ_34/","display_url":"https://www.instagram.com/reel/FGHIJ_34/","resource_type":"reel","external_id":"FGHIJ_34"}'::jsonb
    ) sent
  $$,
  'participant sends an Instagram reel to a group'
);
select is(
  (select external_share ->> 'resource_type' from public.messages where id = (select group_message_id from instagram_share_state)),
  'reel',
  'group message stores the reel attachment'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$
    select * from public.send_message_v2(
      (select group_id from instagram_share_state), null,
      'c2000000-0000-4000-8000-000000000003',
      'external_link', null, null, null, null, null,
      '{"provider":"instagram","canonical_url":"https://www.instagram.com/p/ABCDE_12/","display_url":"https://www.instagram.com/p/ABCDE_12/","resource_type":"post","external_id":"ABCDE_12"}'::jsonb
    )
  $$,
  '%direct_message_conversation_not_found%',
  'non-member cannot send an external link to a group'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.get_direct_message_unread_count(),
  2,
  'direct and group external-link messages contribute to unread count'
);
select lives_ok(
  $$ select public.set_direct_message_block('c1000000-0000-4000-8000-000000000001', true) $$,
  'direct recipient can block the sender'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$
    select * from public.send_message_v2(
      (select direct_id from instagram_share_state), null,
      'c2000000-0000-4000-8000-000000000004',
      'external_link', null, null, null, null, null,
      '{"provider":"instagram","canonical_url":"https://www.instagram.com/p/ABCDE_12/","display_url":"https://www.instagram.com/p/ABCDE_12/","resource_type":"post","external_id":"ABCDE_12"}'::jsonb
    )
  $$,
  '%direct_message_blocked%',
  'direct-message block prevents external-link sends'
);

select * from finish();
rollback;
