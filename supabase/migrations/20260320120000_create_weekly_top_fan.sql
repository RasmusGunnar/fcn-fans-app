create table if not exists public.weekly_top_fan (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  generated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fan_level_key text not null check (
    fan_level_key in (
      'new_fan',
      'community_member',
      'regular_voice',
      'community_core',
      'dedicated',
      'top_fan'
    )
  ),
  weekly_score integer not null check (weekly_score >= 0),
  reason_type text not null check (reason_type in ('post', 'comment', 'activity', 'checkin')),
  reference_post_id uuid null references public.posts(id) on delete set null,
  reference_comment_id uuid null references public.comments_v2(id) on delete set null,
  title text not null,
  subtitle text not null,
  body text not null,
  cta_label text not null default 'Se profil',
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists weekly_top_fan_week_start_uidx
  on public.weekly_top_fan (week_start_date);

create index if not exists weekly_top_fan_published_created_idx
  on public.weekly_top_fan (is_published, created_at desc);

create index if not exists weekly_top_fan_user_week_idx
  on public.weekly_top_fan (user_id, week_start_date desc);

create index if not exists posts_author_created_at_idx
  on public.posts (author_id, created_at desc);

create index if not exists comments_v2_author_created_at_idx
  on public.comments_v2 (author_id, created_at desc);

create index if not exists likes_v2_target_type_created_at_idx
  on public.likes_v2 (target_type, created_at desc);

create index if not exists match_checkins_user_created_at_idx
  on public.match_checkins (user_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'likes_v2'
  ) then
    alter table public.likes_v2
      drop constraint if exists likes_v2_target_type_check;

    alter table public.likes_v2
      add constraint likes_v2_target_type_check
      check (target_type in ('post', 'news', 'event', 'match', 'comment'));
  end if;
end $$;

alter table public.weekly_top_fan enable row level security;

drop policy if exists weekly_top_fan_select_public on public.weekly_top_fan;
create policy weekly_top_fan_select_public on public.weekly_top_fan
for select using (true);
