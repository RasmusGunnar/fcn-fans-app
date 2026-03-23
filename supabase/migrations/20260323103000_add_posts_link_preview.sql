ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS link_preview jsonb NULL;

COMMENT ON COLUMN public.posts.link_preview IS
  'Optional snapshot of a detected external link preview for fan posts.';
