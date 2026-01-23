-- Create likes_v2 table for universal likes (polymorphic)
-- Supports: posts, news, events, matches
-- Target types: 'post', 'news', 'event', 'match'

-- Drop existing if any
DROP TABLE IF EXISTS public.likes_v2 CASCADE;

-- Create likes_v2 table
CREATE TABLE public.likes_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post', 'news', 'event', 'match')),
  target_id text NOT NULL,
  UNIQUE(user_id, target_type, target_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_likes_v2_target ON public.likes_v2(target_type, target_id);
CREATE INDEX idx_likes_v2_user ON public.likes_v2(user_id);

-- Enable RLS
ALTER TABLE public.likes_v2 ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "read all likes_v2" ON public.likes_v2;
CREATE POLICY "read all likes_v2" ON public.likes_v2
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "insert own likes_v2" ON public.likes_v2;
CREATE POLICY "insert own likes_v2" ON public.likes_v2
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete own likes_v2" ON public.likes_v2;
CREATE POLICY "delete own likes_v2" ON public.likes_v2
  FOR DELETE USING (auth.uid() = user_id);

-- RPC function to get like state for multiple targets of same type
-- Returns: target_id, likes_count, liked
-- Note: 'liked' is always false since we don't pass user_id
CREATE OR REPLACE FUNCTION public.get_like_state_v2(
  p_target_type text,
  p_target_ids text[]
)
RETURNS TABLE (
  target_id text,
  likes_count bigint,
  liked boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.target_id,
    COUNT(*)::bigint AS likes_count,
    false AS liked  -- No user context, always false
  FROM public.likes_v2 l
  WHERE l.target_type = p_target_type
    AND l.target_id = ANY(p_target_ids)
  GROUP BY l.target_id;
END;
$$;

-- RPC function to get comment counts for multiple targets of same type
CREATE OR REPLACE FUNCTION public.get_comment_meta_v2(
  p_target_type text,
  p_target_ids text[]
)
RETURNS TABLE (
  target_id text,
  comments_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.target_id,
    COUNT(*)::bigint AS comments_count
  FROM public.comments_v2 c
  WHERE c.target_type = p_target_type
    AND c.target_id = ANY(p_target_ids)
  GROUP BY c.target_id;
END;
$$;
