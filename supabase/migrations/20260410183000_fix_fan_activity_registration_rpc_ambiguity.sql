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
