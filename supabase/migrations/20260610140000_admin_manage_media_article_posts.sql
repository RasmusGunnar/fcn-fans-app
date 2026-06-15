drop policy if exists "app admins update media articles" on public.posts;

create policy "app admins update media articles"
  on public.posts
  for update
  to authenticated
  using (
    post_type = 'media_article'
    and public.is_app_admin()
  )
  with check (
    post_type = 'media_article'
    and public.is_app_admin()
  );

drop policy if exists "app admins delete media articles" on public.posts;

create policy "app admins delete media articles"
  on public.posts
  for delete
  to authenticated
  using (
    post_type = 'media_article'
    and public.is_app_admin()
  );
