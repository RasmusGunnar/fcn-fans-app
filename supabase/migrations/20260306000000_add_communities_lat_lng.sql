-- =====================================================
-- Add geocoding columns to communities table
-- =====================================================
-- Context: Enable map view with markers for communities.
-- Similar to events table, we add lat/lng coordinates plus
-- metadata fields for geocoding tracking.
-- =====================================================

-- Add geocoding fields to communities table
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS place_name text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

-- Create index for map queries (only where coords exist)
CREATE INDEX IF NOT EXISTS idx_communities_lat_lng
  ON public.communities(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
