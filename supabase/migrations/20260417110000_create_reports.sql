create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists reports_created_at_idx
  on public.reports (created_at desc);

create index if not exists reports_target_idx
  on public.reports (target_type, target_id);

alter table public.reports enable row level security;

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and reporter_user_id = auth.uid()
  );
