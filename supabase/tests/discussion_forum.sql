begin;

select plan(28);

select has_table('public', 'discussion_threads', 'discussion_threads table exists');
select has_table('public', 'discussion_posts', 'discussion_posts table exists');
select has_table('public', 'discussion_post_media', 'discussion_post_media table exists');
select has_table('public', 'discussion_reports', 'discussion_reports table exists');

select is(
  (select public from storage.buckets where id = 'discussion-media'),
  false,
  'discussion-media bucket is private'
);

select is(
  (select title from public.discussion_threads where slug = 'fcn-fans-debatten'),
  'FCN Fans-debatten',
  'pinned main thread is seeded'
);

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
    '90000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'discussion-a@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'discussion-b@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'discussion-admin@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  );

insert into public.app_admins (user_id)
values ('90000000-0000-0000-0000-000000000003');

insert into public.discussion_posts (
  id,
  thread_id,
  author_id,
  body
)
values (
  '90000000-0000-0000-0000-000000000101',
  '11111111-1111-4111-8111-111111111111',
  '90000000-0000-0000-0000-000000000001',
  'Root post'
);

insert into public.discussion_posts (
  id,
  thread_id,
  parent_post_id,
  author_id,
  body
)
values (
  '90000000-0000-0000-0000-000000000102',
  '11111111-1111-4111-8111-111111111111',
  '90000000-0000-0000-0000-000000000101',
  '90000000-0000-0000-0000-000000000001',
  'Reply'
);

select throws_like(
  $$
    insert into public.discussion_posts (
      thread_id,
      parent_post_id,
      author_id,
      body
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      '90000000-0000-0000-0000-000000000102',
      '90000000-0000-0000-0000-000000000001',
      'Nested reply'
    )
  $$,
  '%one nesting level%',
  'nested replies are blocked'
);

insert into public.discussion_post_media (
  post_id,
  author_id,
  storage_path,
  media_type,
  mime_type,
  sort_order,
  size_bytes
)
select
  '90000000-0000-0000-0000-000000000101',
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000101/image-' || item || '.jpg',
  'image',
  'image/jpeg',
  item - 1,
  1000
from generate_series(1, 4) as item;

select is(
  (select count(*)::integer from public.discussion_post_media where post_id = '90000000-0000-0000-0000-000000000101'),
  4,
  'four images are allowed'
);

select throws_like(
  $$
    insert into public.discussion_post_media (
      post_id,
      author_id,
      storage_path,
      media_type,
      mime_type,
      sort_order,
      size_bytes
    )
    values (
      '90000000-0000-0000-0000-000000000101',
      '90000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000101/image-5.jpg',
      'image',
      'image/jpeg',
      0,
      1000
    )
  $$,
  '%at most 4 images%',
  'fifth image is blocked'
);

insert into public.discussion_posts (
  id,
  thread_id,
  author_id,
  body
)
values (
  '90000000-0000-0000-0000-000000000103',
  '11111111-1111-4111-8111-111111111111',
  '90000000-0000-0000-0000-000000000001',
  'Media mix post'
);

insert into public.discussion_post_media (
  post_id,
  author_id,
  storage_path,
  media_type,
  mime_type,
  sort_order,
  size_bytes
)
values (
  '90000000-0000-0000-0000-000000000103',
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000103/image.jpg',
  'image',
  'image/jpeg',
  0,
  1000
);

select throws_like(
  $$
    insert into public.discussion_post_media (
      post_id,
      author_id,
      storage_path,
      media_type,
      mime_type,
      sort_order,
      duration_ms,
      size_bytes
    )
    values (
      '90000000-0000-0000-0000-000000000103',
      '90000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000103/video.mp4',
      'video',
      'video/mp4',
      1,
      1000,
      1000
    )
  $$,
  '%cannot mix images and video%',
  'image and video cannot be mixed'
);

insert into public.discussion_posts (
  id,
  thread_id,
  author_id,
  body
)
values (
  '90000000-0000-0000-0000-000000000104',
  '11111111-1111-4111-8111-111111111111',
  '90000000-0000-0000-0000-000000000001',
  'Video post'
);

insert into public.discussion_post_media (
  post_id,
  author_id,
  storage_path,
  media_type,
  mime_type,
  sort_order,
  duration_ms,
  size_bytes
)
values (
  '90000000-0000-0000-0000-000000000104',
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000104/video-1.mp4',
  'video',
  'video/mp4',
  0,
  1000,
  1000
);

select throws_like(
  $$
    insert into public.discussion_post_media (
      post_id,
      author_id,
      storage_path,
      media_type,
      mime_type,
      sort_order,
      duration_ms,
      size_bytes
    )
    values (
      '90000000-0000-0000-0000-000000000104',
      '90000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000104/video-2.mp4',
      'video',
      'video/mp4',
      1,
      1000,
      1000
    )
  $$,
  '%at most 1 video%',
  'second video is blocked'
);

insert into public.discussion_posts (
  id,
  thread_id,
  author_id,
  body,
  created_at
)
values (
  '90000000-0000-0000-0000-000000000105',
  '11111111-1111-4111-8111-111111111111',
  '90000000-0000-0000-0000-000000000001',
  'Old post',
  now() - interval '20 minutes'
);

insert into public.discussion_posts (
  id,
  thread_id,
  author_id,
  body,
  hidden_at,
  hidden_by
)
values (
  '90000000-0000-0000-0000-000000000106',
  '11111111-1111-4111-8111-111111111111',
  '90000000-0000-0000-0000-000000000001',
  'Hidden post',
  now(),
  '90000000-0000-0000-0000-000000000003'
);

insert into public.discussion_posts (
  id,
  thread_id,
  author_id,
  body,
  deleted_at,
  deleted_by
)
values (
  '90000000-0000-0000-0000-000000000107',
  '11111111-1111-4111-8111-111111111111',
  '90000000-0000-0000-0000-000000000001',
  'Deleted post',
  now(),
  '90000000-0000-0000-0000-000000000001'
);

insert into public.discussion_reports (
  post_id,
  reporter_user_id,
  reason,
  details
)
values
  (
    '90000000-0000-0000-0000-000000000101',
    '90000000-0000-0000-0000-000000000001',
    'other',
    'Own report'
  ),
  (
    '90000000-0000-0000-0000-000000000101',
    '90000000-0000-0000-0000-000000000002',
    'spam',
    'Other report'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    update public.discussion_posts
       set hidden_at = now(),
           hidden_by = '90000000-0000-0000-0000-000000000001'
     where id = '90000000-0000-0000-0000-000000000101'
  $$,
  'non-admin hide attempt does not error'
);

select lives_ok(
  $$
    update public.discussion_threads
       set is_locked = true
     where id = '11111111-1111-4111-8111-111111111111'
  $$,
  'non-admin lock attempt does not error'
);

reset role;

select is(
  (select hidden_at is null from public.discussion_posts where id = '90000000-0000-0000-0000-000000000101'),
  true,
  'non-admin cannot hide a discussion post'
);

select is(
  (select is_locked from public.discussion_threads where id = '11111111-1111-4111-8111-111111111111'),
  false,
  'non-admin lock attempt does not change thread'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_like(
  $$
    insert into public.discussion_user_moderation (
      user_id,
      status,
      reason,
      created_by
    )
    values (
      '90000000-0000-0000-0000-000000000002',
      'blocked',
      'not allowed',
      '90000000-0000-0000-0000-000000000001'
    )
  $$,
  '%row-level security%',
  'non-admin cannot moderate discussion users'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$
    update public.discussion_posts
       set body = 'Changed by another user'
     where id = '90000000-0000-0000-0000-000000000101'
  $$,
  'other-user update attempt does not error when no row is visible for update'
);

reset role;

select is(
  (select body from public.discussion_posts where id = '90000000-0000-0000-0000-000000000101'),
  'Root post',
  'user cannot change another users post'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_like(
  $$
    insert into public.discussion_post_media (
      post_id,
      author_id,
      storage_path,
      media_type,
      mime_type,
      sort_order,
      size_bytes
    )
    values (
      '90000000-0000-0000-0000-000000000101',
      '90000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000002/90000000-0000-0000-0000-000000000101/image.jpg',
      'image',
      'image/jpeg',
      0,
      1000
    )
  $$,
  '%row-level security%',
  'user cannot create media records on another users post'
);

select is(
  (
    select count(*)::integer
    from public.discussion_reports
    where reporter_user_id = '90000000-0000-0000-0000-000000000001'
  ),
  0,
  'user cannot see another users reports'
);

select is(
  (
    select count(*)::integer
    from public.discussion_posts
    where id in (
      '90000000-0000-0000-0000-000000000106',
      '90000000-0000-0000-0000-000000000107'
    )
  ),
  0,
  'hidden and deleted posts are invisible to ordinary users'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    update public.discussion_posts
       set body = 'Too late'
     where id = '90000000-0000-0000-0000-000000000105'
  $$,
  'old own-post edit attempt does not error'
);

select lives_ok(
  $$
    update public.discussion_posts
       set body = 'Edited root post',
           created_at = '2099-01-01 00:00:00+00'
     where id = '90000000-0000-0000-0000-000000000101'
  $$,
  'own post can be edited inside window'
);

reset role;

select is(
  (select body from public.discussion_posts where id = '90000000-0000-0000-0000-000000000105'),
  'Old post',
  'own post cannot be edited after 15 minutes'
);

select isnt(
  (select created_at::date from public.discussion_posts where id = '90000000-0000-0000-0000-000000000101'),
  date '2099-01-01',
  'own update cannot tamper with created_at audit field'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_like(
  $$
    insert into storage.objects (
      bucket_id,
      name,
      owner,
      metadata
    )
    values (
      'discussion-media',
      '90000000-0000-0000-0000-000000000002/foreign.jpg',
      '90000000-0000-0000-0000-000000000001',
      '{}'::jsonb
    )
  $$,
  '%row-level security%',
  'user cannot upload to another users discussion-media folder'
);

select lives_ok(
  $$
    insert into storage.objects (
      bucket_id,
      name,
      owner,
      metadata
    )
    values (
      'discussion-media',
      '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000101/image-1.jpg',
      '90000000-0000-0000-0000-000000000001',
      '{}'::jsonb
    )
    on conflict (bucket_id, name) do nothing
  $$,
  'user can upload to own discussion-media folder'
);

select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'discussion-media'
      and name = '90000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000101/image-1.jpg'
  ),
  1,
  'visible discussion media object is readable when linked to visible post'
);

reset role;

select * from finish();

rollback;
