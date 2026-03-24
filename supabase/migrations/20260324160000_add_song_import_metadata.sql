alter table public.songs
  add column if not exists melody_reference text,
  add column if not exists source text,
  add column if not exists source_url text,
  add column if not exists source_key text,
  add column if not exists source_hash text,
  add column if not exists imported_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists is_manually_edited boolean not null default false;

create unique index if not exists songs_source_source_key_unique
  on public.songs (source, source_key)
  where source is not null
    and source_key is not null;
