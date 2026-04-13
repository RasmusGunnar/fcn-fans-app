-- Allow community owners/admins to update their own community rows
-- Scope: minimal UPDATE permission only

drop policy if exists "communities_update_owner_admin" on public.communities;
create policy "communities_update_owner_admin" on public.communities
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.community_members m
      where m.community_id = communities.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.community_members m
      where m.community_id = communities.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
