-- Create comments_v2 table for universal commenting
-- Supports comments on posts, news, events, and matches

-- Create enum for target types
DO $$ BEGIN
  CREATE TYPE comment_target_type AS ENUM ('post', 'news', 'event', 'match');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create comments_v2 table
CREATE TABLE IF NOT EXISTS public.comments_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type comment_target_type NOT NULL,
  target_id text NOT NULL, -- Using text to support various ID formats (UUID for posts, stable IDs for news/events/matches)
  text text NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 2000)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_v2_target ON public.comments_v2(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_v2_author ON public.comments_v2(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_v2_created_at ON public.comments_v2(created_at DESC);

-- Enable RLS
ALTER TABLE public.comments_v2 ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "read all comments_v2" ON public.comments_v2;
CREATE POLICY "read all comments_v2" ON public.comments_v2
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "insert own comments_v2" ON public.comments_v2;
CREATE POLICY "insert own comments_v2" ON public.comments_v2
  FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete own comments_v2" ON public.comments_v2;
CREATE POLICY "delete own comments_v2" ON public.comments_v2
  FOR DELETE USING (auth.uid() = author_id);

-- Allow app_admin role to delete any comment
DROP POLICY IF EXISTS "admin delete comments_v2" ON public.comments_v2;
CREATE POLICY "admin delete comments_v2" ON public.comments_v2
  FOR DELETE USING (public.is_app_admin());

-- Add comment counts function (optional, for future optimization)
CREATE OR REPLACE FUNCTION public.get_comment_count(p_target_type comment_target_type, p_target_id text)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*) FROM public.comments_v2 
  WHERE target_type = p_target_type AND target_id = p_target_id;
$$;
