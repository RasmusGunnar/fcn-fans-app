create or replace function public.can_manage_wild_tigers_songs()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_app_admin()
    or exists (
      select 1
      from public.communities c
      join public.community_members cm
        on cm.community_id = c.id
      where cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
        and lower(trim(c.name)) = 'wild tigers'
    );
$$;

grant execute on function public.can_manage_wild_tigers_songs() to authenticated;

drop policy if exists songs_insert_admin_only on public.songs;
create policy songs_insert_admin_only
  on public.songs
  for insert
  to authenticated
  with check (public.can_manage_wild_tigers_songs());

drop policy if exists songs_update_admin_only on public.songs;
create policy songs_update_admin_only
  on public.songs
  for update
  to authenticated
  using (public.can_manage_wild_tigers_songs())
  with check (public.can_manage_wild_tigers_songs());

drop policy if exists songs_delete_admin_only on public.songs;
create policy songs_delete_admin_only
  on public.songs
  for delete
  to authenticated
  using (public.can_manage_wild_tigers_songs());
