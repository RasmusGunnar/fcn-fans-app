-- Add optional songbook audio. Roll back with a new corrective migration;
-- older app versions tolerate these nullable columns and the public bucket.

alter table public.songs
  add column if not exists audio_path text,
  add column if not exists audio_mime_type text,
  add column if not exists audio_size_bytes bigint;

alter table public.songs
  add constraint songs_audio_fields_complete_check
  check (
    (
      audio_path is null
      and audio_mime_type is null
      and audio_size_bytes is null
    )
    or
    (
      audio_path is not null
      and audio_mime_type is not null
      and audio_size_bytes is not null
    )
  ),
  add constraint songs_audio_size_check
  check (
    audio_size_bytes is null
    or (audio_size_bytes > 0 and audio_size_bytes <= 26214400)
  ),
  add constraint songs_audio_mime_type_check
  check (
    audio_mime_type is null
    or audio_mime_type in ('audio/mpeg', 'audio/mp4', 'audio/aac')
  ),
  add constraint songs_audio_path_check
  check (
    audio_path is null
    or audio_path ~ (
      '^'
      || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](mp3|m4a|aac)$'
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'song-audio',
  'song-audio',
  true,
  26214400,
  array['audio/mpeg', 'audio/mp4', 'audio/aac']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "song audio manager insert" on storage.objects;
create policy "song audio manager insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'song-audio'
    and public.can_manage_wild_tigers_songs()
    and array_length(storage.foldername(name), 1) = 1
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](mp3|m4a|aac)$'
    and exists (
      select 1
      from public.songs song
      where song.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "song audio manager delete" on storage.objects;
create policy "song audio manager delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'song-audio'
    and public.can_manage_wild_tigers_songs()
    and array_length(storage.foldername(name), 1) = 1
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](mp3|m4a|aac)$'
  );
