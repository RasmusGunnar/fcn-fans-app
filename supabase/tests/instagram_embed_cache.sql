begin;

select plan(10);

select has_table('public', 'instagram_embed_cache', 'Instagram embed cache exists');
select has_column('public', 'instagram_embed_cache', 'embed_html', 'sanitized embed HTML is cached');
select has_column('public', 'instagram_embed_cache', 'expires_at', 'cache expiry is explicit');
select is(
  has_table_privilege('anon', 'public.instagram_embed_cache', 'select'),
  false,
  'anonymous users cannot read the cache directly'
);
select is(
  has_table_privilege('authenticated', 'public.instagram_embed_cache', 'select'),
  false,
  'authenticated users cannot read the cache directly'
);
select is(
  has_table_privilege('authenticated', 'public.instagram_embed_cache', 'insert'),
  false,
  'authenticated users cannot write the cache directly'
);
select is(
  has_table_privilege('service_role', 'public.instagram_embed_cache', 'insert'),
  true,
  'the service backend can write the cache'
);

set local role service_role;

insert into public.instagram_embed_cache (
  canonical_url, resource_type, status, embed_html, fetched_at, expires_at
)
values (
  'https://www.instagram.com/p/ABCDE_12/',
  'post',
  'ready',
  '<blockquote class="instagram-media"></blockquote>',
  now(),
  now() + interval '12 hours'
);

select is(
  (select status from public.instagram_embed_cache where canonical_url = 'https://www.instagram.com/p/ABCDE_12/'),
  'ready',
  'service backend can cache a valid post'
);

select throws_ok(
  $$
    insert into public.instagram_embed_cache (
      canonical_url, resource_type, status, embed_html, fetched_at, expires_at
    ) values (
      'https://instagram.com.evil.test/p/ABCDE_12/', 'post', 'ready',
      '<blockquote class="instagram-media"></blockquote>', now(), now() + interval '1 hour'
    )
  $$,
  '23514',
  null,
  'lookalike hosts cannot enter the cache'
);

select throws_ok(
  $$
    insert into public.instagram_embed_cache (
      canonical_url, resource_type, status, embed_html, error_code, fetched_at, expires_at
    ) values (
      'https://www.instagram.com/reel/FGHIJ_34/', 'reel', 'unavailable',
      '<blockquote class="instagram-media"></blockquote>', 'meta_http_404', now(), now() + interval '10 minutes'
    )
  $$,
  '23514',
  null,
  'negative cache rows cannot contain embed HTML'
);

select * from finish();
rollback;
