-- Add media_type to posts to distinguish image vs video
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type text;

-- Optional constraint to keep values consistent (idempotent)
DO $$
BEGIN
  ALTER TABLE posts
    ADD CONSTRAINT posts_media_type_check
    CHECK (media_type IN ('image', 'video'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill existing records with media_url
UPDATE posts
SET media_type = 'image'
WHERE media_url IS NOT NULL AND (media_type IS NULL OR media_type = '');
