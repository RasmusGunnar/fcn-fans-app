-- RSVP/Attendance table for events and matches
create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('event','match')),
  entity_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested','not_going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint: one RSVP per user per entity
create unique index if not exists rsvps_unique_user_entity on rsvps(entity_type, entity_id, user_id);

-- Index for fast lookup
create index if not exists rsvps_entity_idx on rsvps(entity_type, entity_id);
create index if not exists rsvps_user_idx on rsvps(user_id);

-- Trigger to update updated_at
create or replace function update_rsvps_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger rsvps_updated_at_trigger
before update on rsvps
for each row execute procedure update_rsvps_updated_at();

-- RLS policies
alter table rsvps enable row level security;

-- Public read
create policy rsvps_select_public on rsvps
for select using (true);

-- Only user can insert/update/delete their own RSVP
create policy rsvps_modify_self on rsvps
for insert with check (auth.uid() = user_id)
for update using (auth.uid() = user_id)
for delete using (auth.uid() = user_id);
