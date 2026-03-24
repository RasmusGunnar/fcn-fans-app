create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lyrics text not null default '',
  spotify_url text,
  category text not null default 'slagsang' check (category in ('slagsang', 'spillersang')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.songs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'songs'
      and policyname = 'songs_select_public'
  ) then
    create policy songs_select_public
      on public.songs
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'songs'
      and policyname = 'songs_insert_admin_only'
  ) then
    create policy songs_insert_admin_only
      on public.songs
      for insert
      to authenticated
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'songs'
      and policyname = 'songs_update_admin_only'
  ) then
    create policy songs_update_admin_only
      on public.songs
      for update
      to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'songs'
      and policyname = 'songs_delete_admin_only'
  ) then
    create policy songs_delete_admin_only
      on public.songs
      for delete
      to authenticated
      using (public.is_app_admin());
  end if;
end $$;

insert into public.songs (title, lyrics, spotify_url, category, sort_order)
select *
from (
  values
    (
      'Vi Er FCN',
      E'Vi er FCN, vi er FCN\nRod og hvid er vores farver\nVi er FCN, vi er FCN\nVi vinder hver kamp',
      'https://open.spotify.com/',
      'slagsang',
      10
    ),
    (
      'Nordsjaelland Sang',
      E'Nordsjaelland, Nordsjaelland\nVi stotter vores hold\nNordsjaelland, Nordsjaelland\nVi er stolte af vores klub',
      'https://open.spotify.com/',
      'slagsang',
      20
    ),
    (
      'Heia FCN',
      E'Heia FCN, heia FCN\nVi synger hojt og klart\nHeia FCN, heia FCN\nVi er de bedste i landet',
      'https://open.spotify.com/',
      'slagsang',
      30
    ),
    (
      'Rod og Hvid',
      E'Rod og hvid, rod og hvid\nDet er vores farver\nRod og hvid, rod og hvid\nVi holder sammen',
      'https://open.spotify.com/',
      'slagsang',
      40
    ),
    (
      'Vi Giver Aldrig Op',
      E'Vi giver aldrig op, aldrig op\nVi kamper til det sidste\nVi giver aldrig op, aldrig op\nFCN sejrer altid',
      'https://open.spotify.com/',
      'slagsang',
      50
    )
) as seed(title, lyrics, spotify_url, category, sort_order)
where not exists (
  select 1 from public.songs
);
