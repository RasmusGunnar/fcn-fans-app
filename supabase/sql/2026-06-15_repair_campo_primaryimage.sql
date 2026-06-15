-- Campo media article image repair.
-- Status: MANUAL ACTION REQUIRED.
-- Run in the Supabase Dashboard SQL Editor after reviewing the diagnostics.

-- Diagnose every unresolved JSON-LD image reference before changing data.
select
  id,
  status,
  source_key,
  canonical_url,
  image_url
from public.media_article_candidates
where image_url like '%#primaryimage'
order by created_at desc;

select
  id,
  created_at,
  link_preview ->> 'url' as article_url,
  link_preview ->> 'imageUrl' as image_url
from public.posts
where post_type = 'media_article'
  and link_preview ->> 'imageUrl' like '%#primaryimage'
order by created_at desc;

begin;

-- Known Campo row verified against the publisher's direct og:image and RSS image.
update public.media_article_candidates
set
  image_url =
    'https://campo.dk/wp-content/uploads/2026/06/campo-victor-gustafsen-fc-nordsjaelland.jpg',
  updated_at = now()
where source_key = 'campo'
  and rtrim(canonical_url, '/') =
    'https://campo.dk/2026/06/15/fc-nordsjaelland-forlaenger-forsvarsspiller'
  and image_url like '%#primaryimage';

update public.posts
set link_preview = jsonb_set(
  link_preview,
  '{imageUrl}',
  to_jsonb(
    'https://campo.dk/wp-content/uploads/2026/06/campo-victor-gustafsen-fc-nordsjaelland.jpg'::text
  ),
  true
)
where post_type = 'media_article'
  and rtrim(link_preview ->> 'url', '/') =
    'https://campo.dk/2026/06/15/fc-nordsjaelland-forlaenger-forsvarsspiller'
  and link_preview ->> 'imageUrl' like '%#primaryimage';

commit;

-- Both queries should return zero rows for the known repaired article.
select
  id,
  status,
  canonical_url,
  image_url
from public.media_article_candidates
where source_key = 'campo'
  and rtrim(canonical_url, '/') =
    'https://campo.dk/2026/06/15/fc-nordsjaelland-forlaenger-forsvarsspiller'
  and image_url like '%#primaryimage';

select
  id,
  link_preview ->> 'url' as article_url,
  link_preview ->> 'imageUrl' as image_url
from public.posts
where post_type = 'media_article'
  and rtrim(link_preview ->> 'url', '/') =
    'https://campo.dk/2026/06/15/fc-nordsjaelland-forlaenger-forsvarsspiller'
  and link_preview ->> 'imageUrl' like '%#primaryimage';
