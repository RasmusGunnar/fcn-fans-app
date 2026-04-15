create or replace function public.delete_fan_activity(
  p_fan_activity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_activity public.fan_activities%rowtype;
  v_deleted_id uuid;
begin
  if v_user_id is null then
    raise exception 'Du skal være logget ind for at slette fanaktiviteten.';
  end if;

  select fa.*
  into v_activity
  from public.fan_activities as fa
  where fa.id = p_fan_activity_id
  for update;

  if not found then
    raise exception 'Fanaktiviteten findes ikke længere.';
  end if;

  if coalesce(v_activity.created_by = v_user_id, false) = false
     and public.can_manage_fan_activity_community(v_activity.community_id, v_user_id) = false then
    raise exception 'Du har ikke adgang til at slette denne fanaktivitet.';
  end if;

  delete from public.fan_activities as fa
  where fa.id = p_fan_activity_id
  returning fa.id
  into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Fanaktiviteten kunne ikke slettes.';
  end if;

  return v_deleted_id;
end;
$$;

grant execute on function public.delete_fan_activity(uuid) to authenticated;
