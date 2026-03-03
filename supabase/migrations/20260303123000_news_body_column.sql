-- Add optional body column for news text support
alter table if exists public.news add column if not exists body text null;
alter table if exists public.news_items add column if not exists body text null;

-- Backfill body from legacy note content
update public.news_items
set body = note
where body is null
  and note is not null;
