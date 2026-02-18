-- =====================================================
-- Ensure events SELECT policy + geocoding columns exist
-- =====================================================
-- Context: fetchEventsUpcoming silently returned [] because
-- (a) lat/lng columns only existed via manual SQL, and/or
-- (b) the SELECT policy was only defined in migrations_legacy.
-- This migration makes both idempotent so `supabase db push`
-- or `supabase db reset` always produces a working schema.
-- =====================================================

-- 1) Geocoding columns (idempotent)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Danmark',
  ADD COLUMN IF NOT EXISTS address_text text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS place_name text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_events_lat_lng
  ON public.events(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- 2) Ensure SELECT policy exists (public read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'events'
      AND policyname = 'Allow public read access to events'
  ) THEN
    CREATE POLICY "Allow public read access to events"
      ON public.events FOR SELECT
      USING (true);
  END IF;
END $$;
