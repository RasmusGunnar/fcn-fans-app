-- Mark the server-selected active standings season without deleting historical cache rows.

ALTER TABLE public.standings_cache
  ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE public.standings_cache
SET is_active = false
WHERE is_active IS NULL;

ALTER TABLE public.standings_cache
  ALTER COLUMN is_active SET DEFAULT false,
  ALTER COLUMN is_active SET NOT NULL;

WITH ranked_active AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY league_id
      ORDER BY updated_at DESC, season DESC
    ) AS rn
  FROM public.standings_cache
  WHERE is_active = true
)
UPDATE public.standings_cache AS standings_cache
SET is_active = false
FROM ranked_active
WHERE standings_cache.ctid = ranked_active.ctid
  AND ranked_active.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS standings_cache_one_active_per_league_idx
  ON public.standings_cache (league_id)
  WHERE is_active = true;
