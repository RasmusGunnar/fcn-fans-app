-- Storage bucket for post media (public for MVP)
select storage.create_bucket('post-media', public => true);

-- Storage RLS: allow authenticated users to upload to their own folder (userId/* prefix)
alter table storage.objects enable row level security;

create policy "allow authenticated upload to own folder" on storage.objects
  for insert with check (
    bucket_id = 'post-media' 
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "allow public read post-media" on storage.objects
  for select using (
    bucket_id = 'post-media'
  );

-- Profiles table (extend public schema to store expo push token)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text,
  updated_at timestamp with time zone default now()
);

-- Posts table
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamp with time zone default now(),
  media jsonb not null default '[]'::jsonb
);

-- Comments table
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamp with time zone default now()
);

-- RLS policies
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.profiles enable row level security;

create policy "read all posts" on public.posts for select using (true);
create policy "insert own posts" on public.posts for insert with check (auth.uid() = author_id);

create policy "read all comments" on public.comments for select using (true);
create policy "insert own comments" on public.comments for insert with check (auth.uid() = author_id);

create policy "read own profile" on public.profiles for select using (auth.uid() = id);
create policy "upsert own token" on public.profiles for insert with check (auth.uid() = id);
create policy "update own token" on public.profiles for update using (auth.uid() = id);
