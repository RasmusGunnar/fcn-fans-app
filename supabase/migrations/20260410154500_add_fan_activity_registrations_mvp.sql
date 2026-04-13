alter table if exists public.fan_activities
  add column if not exists registration_enabled boolean not null default false;

alter table if exists public.fan_activities
  add column if not exists registration_capacity integer null;

alter table if exists public.fan_activities
  add column if not exists registration_price_dkk integer not null default 0;

alter table if exists public.fan_activities
  add column if not exists registration_payment_mode text not null default 'free';

alter table if exists public.fan_activities
  add column if not exists registration_payment_instructions text null;

alter table if exists public.fan_activities
  add column if not exists registration_mobilepay_info text null;

alter table if exists public.fan_activities
  drop constraint if exists fan_activities_registration_capacity_positive;

alter table if exists public.fan_activities
  add constraint fan_activities_registration_capacity_positive
  check (registration_capacity is null or registration_capacity > 0);

alter table if exists public.fan_activities
  drop constraint if exists fan_activities_registration_price_nonnegative;

alter table if exists public.fan_activities
  add constraint fan_activities_registration_price_nonnegative
  check (registration_price_dkk >= 0);

alter table if exists public.fan_activities
  drop constraint if exists fan_activities_registration_payment_mode_valid;

alter table if exists public.fan_activities
  add constraint fan_activities_registration_payment_mode_valid
  check (registration_payment_mode in ('free', 'manual'));

create or replace function public.can_manage_fan_activity_registrations(
  p_fan_activity_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_fan_activity_id is null or p_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.fan_activities fa
    join public.community_members cm
      on cm.community_id = fa.community_id
    where fa.id = p_fan_activity_id
      and cm.user_id = p_user_id
      and cm.role in ('owner', 'admin')
  );
end;
$$;

create table if not exists public.fan_activity_registrations (
  id uuid primary key default gen_random_uuid(),
  fan_activity_id uuid not null references public.fan_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  payment_reference text generated always as (
    'FA-' || upper(substr(replace(id::text, '-', ''), 1, 12))
  ) stored,
  user_marked_paid_at timestamptz null,
  verified_at timestamptz null,
  verified_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fan_activity_registrations_status_valid
    check (status in ('pending_payment', 'pending_verification', 'confirmed')),
  constraint fan_activity_registrations_unique_user_per_activity
    unique (fan_activity_id, user_id),
  constraint fan_activity_registrations_unique_reference
    unique (payment_reference)
);

create index if not exists idx_fan_activity_registrations_activity_status
  on public.fan_activity_registrations (fan_activity_id, status, created_at desc);

create index if not exists idx_fan_activity_registrations_user
  on public.fan_activity_registrations (user_id, created_at desc);

create or replace function public.set_fan_activity_registrations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_fan_activity_registrations_set_updated_at on public.fan_activity_registrations;
create trigger trg_fan_activity_registrations_set_updated_at
  before update on public.fan_activity_registrations
  for each row
  execute function public.set_fan_activity_registrations_updated_at();

alter table public.fan_activity_registrations enable row level security;

drop policy if exists "fan_activity_registrations_select_self" on public.fan_activity_registrations;
create policy "fan_activity_registrations_select_self"
  on public.fan_activity_registrations
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "fan_activity_registrations_select_managers" on public.fan_activity_registrations;
create policy "fan_activity_registrations_select_managers"
  on public.fan_activity_registrations
  for select
  to authenticated
  using (public.can_manage_fan_activity_registrations(fan_activity_id, auth.uid()));

create or replace function public.get_fan_activity_registration_snapshots(
  p_activity_ids uuid[]
)
returns table (
  fan_activity_id uuid,
  reserved_count integer,
  confirmed_count integer,
  pending_verification_count integer,
  pending_payment_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    fa.id as fan_activity_id,
    count(far.id) filter (
      where far.status in ('pending_verification', 'confirmed')
    )::integer as reserved_count,
    count(far.id) filter (
      where far.status = 'confirmed'
    )::integer as confirmed_count,
    count(far.id) filter (
      where far.status = 'pending_verification'
    )::integer as pending_verification_count,
    count(far.id) filter (
      where far.status = 'pending_payment'
    )::integer as pending_payment_count
  from public.fan_activities fa
  left join public.fan_activity_registrations far
    on far.fan_activity_id = fa.id
  where fa.id = any(coalesce(p_activity_ids, array[]::uuid[]))
  group by fa.id;
$$;

create or replace function public.create_fan_activity_registration(
  p_fan_activity_id uuid
)
returns table (
  id uuid,
  fan_activity_id uuid,
  user_id uuid,
  status text,
  payment_reference text,
  user_marked_paid_at timestamptz,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_activity public.fan_activities%rowtype;
  v_registration public.fan_activity_registrations%rowtype;
  v_reserved_count integer := 0;
  v_target_status text := 'confirmed';
begin
  if v_user_id is null then
    raise exception 'Du skal være logget ind for at tilmelde dig.';
  end if;

  select fa.*
  into v_activity
  from public.fan_activities as fa
  where fa.id = p_fan_activity_id
    and fa.is_published = true
    and fa.is_cancelled = false
  for update;

  if not found then
    raise exception 'Aktiviteten findes ikke længere.';
  end if;

  if coalesce(v_activity.registration_enabled, false) = false then
    raise exception 'Tilmelding er ikke slået til for denne aktivitet.';
  end if;

  select far.*
  into v_registration
  from public.fan_activity_registrations as far
  where far.fan_activity_id = p_fan_activity_id
    and far.user_id = v_user_id;

  if found then
    return query
      select
        v_registration.id,
        v_registration.fan_activity_id,
        v_registration.user_id,
        v_registration.status,
        v_registration.payment_reference,
        v_registration.user_marked_paid_at,
        v_registration.verified_at,
        v_registration.verified_by,
        v_registration.created_at,
        v_registration.updated_at;
    return;
  end if;

  select count(*)::integer
  into v_reserved_count
  from public.fan_activity_registrations as far
  where far.fan_activity_id = p_fan_activity_id
    and far.status in ('pending_verification', 'confirmed');

  if v_activity.registration_capacity is not null
     and v_reserved_count >= v_activity.registration_capacity then
    raise exception 'Aktiviteten er fuldt booket.';
  end if;

  if v_activity.registration_payment_mode = 'manual'
     and coalesce(v_activity.registration_price_dkk, 0) > 0 then
    v_target_status := 'pending_payment';
  end if;

  begin
    insert into public.fan_activity_registrations (
      fan_activity_id,
      user_id,
      status
    )
    values (
      p_fan_activity_id,
      v_user_id,
      v_target_status
    )
    returning *
    into v_registration;
  exception
    when unique_violation then
      select far.*
      into v_registration
      from public.fan_activity_registrations as far
      where far.fan_activity_id = p_fan_activity_id
        and far.user_id = v_user_id;
  end;

  return query
    select
      v_registration.id,
      v_registration.fan_activity_id,
      v_registration.user_id,
      v_registration.status,
      v_registration.payment_reference,
      v_registration.user_marked_paid_at,
      v_registration.verified_at,
      v_registration.verified_by,
      v_registration.created_at,
      v_registration.updated_at;
end;
$$;

create or replace function public.mark_fan_activity_registration_paid(
  p_fan_activity_id uuid
)
returns table (
  id uuid,
  fan_activity_id uuid,
  user_id uuid,
  status text,
  payment_reference text,
  user_marked_paid_at timestamptz,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_activity public.fan_activities%rowtype;
  v_registration public.fan_activity_registrations%rowtype;
  v_reserved_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Du skal være logget ind for at opdatere din tilmelding.';
  end if;

  select fa.*
  into v_activity
  from public.fan_activities as fa
  where fa.id = p_fan_activity_id
    and fa.is_published = true
    and fa.is_cancelled = false
  for update;

  if not found then
    raise exception 'Aktiviteten findes ikke længere.';
  end if;

  if coalesce(v_activity.registration_enabled, false) = false then
    raise exception 'Tilmelding er ikke slået til for denne aktivitet.';
  end if;

  if v_activity.registration_payment_mode <> 'manual'
     or coalesce(v_activity.registration_price_dkk, 0) <= 0 then
    raise exception 'Aktiviteten bruger ikke manuel betaling.';
  end if;

  select far.*
  into v_registration
  from public.fan_activity_registrations as far
  where far.fan_activity_id = p_fan_activity_id
    and far.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Du har ikke tilmeldt dig endnu.';
  end if;

  if v_registration.status in ('pending_verification', 'confirmed') then
    return query
      select
        v_registration.id,
        v_registration.fan_activity_id,
        v_registration.user_id,
        v_registration.status,
        v_registration.payment_reference,
        v_registration.user_marked_paid_at,
        v_registration.verified_at,
        v_registration.verified_by,
        v_registration.created_at,
        v_registration.updated_at;
    return;
  end if;

  select count(*)::integer
  into v_reserved_count
  from public.fan_activity_registrations as far
  where far.fan_activity_id = p_fan_activity_id
    and far.status in ('pending_verification', 'confirmed');

  if v_activity.registration_capacity is not null
     and v_reserved_count >= v_activity.registration_capacity then
    raise exception 'Der er ikke flere pladser tilbage lige nu.';
  end if;

  update public.fan_activity_registrations as far
  set
    status = 'pending_verification',
    user_marked_paid_at = coalesce(v_registration.user_marked_paid_at, now())
  where far.id = v_registration.id
  returning *
  into v_registration;

  return query
    select
      v_registration.id,
      v_registration.fan_activity_id,
      v_registration.user_id,
      v_registration.status,
      v_registration.payment_reference,
      v_registration.user_marked_paid_at,
      v_registration.verified_at,
      v_registration.verified_by,
      v_registration.created_at,
      v_registration.updated_at;
end;
$$;

create or replace function public.admin_update_fan_activity_registration_status(
  p_registration_id uuid,
  p_status text
)
returns table (
  id uuid,
  fan_activity_id uuid,
  user_id uuid,
  status text,
  payment_reference text,
  user_marked_paid_at timestamptz,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration public.fan_activity_registrations%rowtype;
  v_activity public.fan_activities%rowtype;
  v_reserved_count integer := 0;
  v_normalized_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_user_id is null then
    raise exception 'Du skal være logget ind for at håndtere tilmeldinger.';
  end if;

  if v_normalized_status not in ('pending_payment', 'pending_verification', 'confirmed') then
    raise exception 'Ugyldig tilmeldingsstatus.';
  end if;

  select far.*
  into v_registration
  from public.fan_activity_registrations as far
  where far.id = p_registration_id
  for update;

  if not found then
    raise exception 'Tilmeldingen findes ikke længere.';
  end if;

  select fa.*
  into v_activity
  from public.fan_activities as fa
  where fa.id = v_registration.fan_activity_id
  for update;

  if not found then
    raise exception 'Aktiviteten findes ikke længere.';
  end if;

  if public.can_manage_fan_activity_registrations(v_registration.fan_activity_id, v_user_id) = false then
    raise exception 'Du har ikke adgang til at håndtere denne tilmelding.';
  end if;

  if v_normalized_status in ('pending_verification', 'confirmed')
     and v_registration.status not in ('pending_verification', 'confirmed') then
    select count(*)::integer
    into v_reserved_count
    from public.fan_activity_registrations as far
    where far.fan_activity_id = v_registration.fan_activity_id
      and far.status in ('pending_verification', 'confirmed')
      and far.id <> v_registration.id;

    if v_activity.registration_capacity is not null
       and v_reserved_count >= v_activity.registration_capacity then
      raise exception 'Der er ikke flere pladser tilbage lige nu.';
    end if;
  end if;

  update public.fan_activity_registrations as far
  set
    status = v_normalized_status,
    verified_at =
      case
        when v_normalized_status = 'confirmed' then now()
        else null
      end,
    verified_by =
      case
        when v_normalized_status = 'confirmed' then v_user_id
        else null
      end
  where far.id = v_registration.id
  returning *
  into v_registration;

  return query
    select
      v_registration.id,
      v_registration.fan_activity_id,
      v_registration.user_id,
      v_registration.status,
      v_registration.payment_reference,
      v_registration.user_marked_paid_at,
      v_registration.verified_at,
      v_registration.verified_by,
      v_registration.created_at,
      v_registration.updated_at;
end;
$$;

grant execute on function public.get_fan_activity_registration_snapshots(uuid[]) to anon, authenticated;
grant execute on function public.create_fan_activity_registration(uuid) to authenticated;
grant execute on function public.mark_fan_activity_registration_paid(uuid) to authenticated;
grant execute on function public.admin_update_fan_activity_registration_status(uuid, text) to authenticated;
