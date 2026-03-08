-- Add poll support to posts
-- Stores poll payloads directly on public.posts via nullable JSONB

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS poll_data jsonb NULL;

COMMENT ON COLUMN public.posts.poll_data IS
  'Nullable poll payload. Expected shape: {"question": string, "options": [{"id": string, "text": string}], "duration": number, "expires_at": string (ISO-8601 timestamp)}';

-- Partial index for fast detection/listing of poll posts
CREATE INDEX IF NOT EXISTS idx_posts_poll_data_present
  ON public.posts (created_at DESC)
  WHERE poll_data IS NOT NULL;
