-- Migration: Create news_items table for URL-based news sharing
-- This allows users or communities to share news articles with link previews

-- Ensure pgcrypto extension for UUID generation
create extension if not exists pgcrypto;

-- Create news_items table (idempotent)
create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text,
  description text,
  image_url text,
  site_name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  actor_type text not null default 'user' check (actor_type in ('user', 'community')),
  actor_id uuid,
  community_id uuid,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.news_items enable row level security;

-- Drop existing policies if they exist (idempotent)
drop policy if exists "read all news items" on public.news_items;
drop policy if exists "insert own news items" on public.news_items;
drop policy if exists "delete own news items" on public.news_items;

-- RLS policies
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "read all news items" on public.news_items
      for select using (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "read all news items" already exists, skipping';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "insert own news items" on public.news_items
      for insert with check (
        auth.uid() = created_by
        and (
          -- If posting as user, actor_type must be ''user'' and actor_id must be user''s id
          (actor_type = ''user'' and actor_id = auth.uid())
          or
          -- If posting as community, user must be owner/admin of that community
          (actor_type = ''community'' and actor_id is not null and exists (
            select 1 from public.community_members
            where community_id = actor_id
            and user_id = auth.uid()
            and role in (''owner'', ''admin'')
          ))
        )
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "insert own news items" already exists, skipping';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "delete own news items" on public.news_items
      for delete using (auth.uid() = created_by)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "delete own news items" already exists, skipping';
  END;
END $$;

-- Create indexes for performance (idempotent)
create index if not exists idx_news_items_created_at on public.news_items(created_at desc);
create index if not exists idx_news_items_created_by on public.news_items(created_by);
create index if not exists idx_news_items_community on public.news_items(community_id);

