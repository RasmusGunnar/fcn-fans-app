create or replace function public.can_manage_fan_activity_community(
  p_community_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_community_id is null or p_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = p_user_id
      and cm.role in ('owner', 'admin')
  );
end;
$$;
