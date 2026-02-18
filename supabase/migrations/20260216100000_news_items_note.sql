-- Add note column to news_items table
alter table public.news_items add column if not exists note text null;

-- No RLS changes needed - note follows same access rules as the row
