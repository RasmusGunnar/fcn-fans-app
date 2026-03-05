-- =====================================================
-- Add location_label and location_geohash to communities
-- =====================================================
-- Purpose: store human-readable location labels for communities
-- and optional geohash for geographic queries.
-- =====================================================

ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS location_label text;

ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS location_geohash text;
