create table if not exists public.instagram_embed_cache (
  canonical_url text primary key,
  resource_type text not null,
  status text not null,
  embed_html text,
  author_name text,
  author_url text,
  thumbnail_url text,
  error_code text,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_embed_cache_resource_type_check
    check (resource_type in ('post', 'reel', 'profile')),
  constraint instagram_embed_cache_resource_url_match_check
    check (
      (resource_type = 'post' and canonical_url ~ '^https://www\.instagram\.com/p/[A-Za-z0-9_-]{2,128}/$')
      or (resource_type = 'reel' and canonical_url ~ '^https://www\.instagram\.com/reel/[A-Za-z0-9_-]{2,128}/$')
      or (resource_type = 'profile' and canonical_url ~ '^https://www\.instagram\.com/[A-Za-z0-9][A-Za-z0-9._]{0,29}/$')
    ),
  constraint instagram_embed_cache_status_check
    check (status in ('ready', 'unavailable')),
  constraint instagram_embed_cache_canonical_url_check
    check (
      canonical_url ~ '^https://www\.instagram\.com/(p/[A-Za-z0-9_-]{2,128}|reel/[A-Za-z0-9_-]{2,128}|[A-Za-z0-9][A-Za-z0-9._]{0,29})/$'
    ),
  constraint instagram_embed_cache_payload_check
    check (
      (status = 'ready' and embed_html is not null and error_code is null)
      or (status = 'unavailable' and embed_html is null and error_code is not null)
    ),
  constraint instagram_embed_cache_html_size_check
    check (embed_html is null or octet_length(embed_html) <= 204800),
  constraint instagram_embed_cache_expiry_check
    check (expires_at > fetched_at),
  constraint instagram_embed_cache_author_url_check
    check (
      author_url is null
      or (
        length(author_url) <= 2048
        and author_url ~ '^https://www\.instagram\.com/[A-Za-z0-9][A-Za-z0-9._]{0,29}/$'
      )
    ),
  constraint instagram_embed_cache_thumbnail_url_check
    check (thumbnail_url is null or (length(thumbnail_url) <= 2048 and thumbnail_url ~ '^https://')),
  constraint instagram_embed_cache_metadata_size_check
    check (
      (author_name is null or length(author_name) <= 100)
      and (error_code is null or length(error_code) <= 100)
    )
);

create index if not exists instagram_embed_cache_expires_at_idx
  on public.instagram_embed_cache (expires_at);

alter table public.instagram_embed_cache enable row level security;

revoke all on table public.instagram_embed_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.instagram_embed_cache to service_role;

comment on table public.instagram_embed_cache is
  'Server-only cache for sanitized HTML returned by the official Meta Instagram oEmbed endpoint.';
