-- =====================================================
-- Add cover image columns to events + event-media bucket
-- =====================================================
-- Purpose: Support cover images for events/bus_trips.
-- Columns: cover_bucket (text), cover_path (text)
-- Bucket: event-media with public read / authenticated write
-- Idempotent: all ops use IF NOT EXISTS / DO $$ guards.
-- =====================================================

-- 1) Cover image columns on events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cover_bucket text,
  ADD COLUMN IF NOT EXISTS cover_path   text;

-- 2) Create event-media storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-media', 'event-media', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Storage policy: anyone can read (public bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'event-media: public read'
  ) THEN
    CREATE POLICY "event-media: public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'event-media');
  END IF;
END $$;

-- 4) Storage policy: authenticated users can upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'event-media: authenticated insert'
  ) THEN
    CREATE POLICY "event-media: authenticated insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'event-media');
  END IF;
END $$;

-- 5) Storage policy: authenticated users can update their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'event-media: authenticated update'
  ) THEN
    CREATE POLICY "event-media: authenticated update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'event-media')
      WITH CHECK (bucket_id = 'event-media');
  END IF;
END $$;

-- 6) Storage policy: authenticated users can delete their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'event-media: authenticated delete'
  ) THEN
    CREATE POLICY "event-media: authenticated delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'event-media');
  END IF;
END $$;
