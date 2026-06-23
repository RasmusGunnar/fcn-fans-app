-- Ensure fixture geocoding columns exist in repository-managed schema history.
-- Hosted Supabase already has these columns; this is safe for existing environments.

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS place_name text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
