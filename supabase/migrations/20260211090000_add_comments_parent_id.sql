alter table public.comments_v2
  add column if not exists parent_id uuid null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'comments_v2'
      AND c.conname = 'comments_v2_parent_id_fkey'
  ) THEN
    ALTER TABLE public.comments_v2
      ADD CONSTRAINT comments_v2_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.comments_v2(id)
      ON DELETE CASCADE;
  END IF;
END $$;

create index if not exists comments_v2_target_parent_created_idx
  on public.comments_v2 (target_type, target_id, parent_id, created_at);
