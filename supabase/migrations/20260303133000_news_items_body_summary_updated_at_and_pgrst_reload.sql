-- Ensure news_items supports optional long-form body and summary metadata
-- Idempotent migration: safe to run multiple times

alter table if exists public.news_items
  add column if not exists body text null;

alter table if exists public.news_items
  add column if not exists summary text null;

alter table if exists public.news_items
  add column if not exists updated_at timestamptz default now();

-- Refresh PostgREST schema cache so new columns are immediately available
notify pgrst, 'reload schema';
