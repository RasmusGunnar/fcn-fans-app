-- FCN Fixtures table for storing match data from API-FOOTBALL
create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'api-football',
  provider_fixture_id text unique not null,
  kickoff_at timestamptz not null,
  competition text,
  round text,
  venue text,
  venue_city text,
  home_team text not null,
  away_team text not null,
  home_logo_url text,
  away_logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for quick lookups of upcoming fixtures
create index if not exists idx_fixtures_kickoff_at on public.fixtures(kickoff_at);

-- Enable RLS
alter table public.fixtures enable row level security;

-- Drop existing policy if it exists, then create
drop policy if exists "Public read fixtures" on public.fixtures;

-- Public read access for all users (anon + authenticated)
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "Public read fixtures" on public.fixtures 
      for select 
      using (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Public read fixtures" already exists, skipping';
  END;
END $$;
