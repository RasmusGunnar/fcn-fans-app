create table if not exists public.standings_cache (
  league_id text not null,
  season text not null,
  rows jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (league_id, season)
);

alter table public.standings_cache enable row level security;

create policy "standings_cache_select" on public.standings_cache
  for select
  using (true);
