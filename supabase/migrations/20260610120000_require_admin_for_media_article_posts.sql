create index if not exists posts_media_article_url_idx
  on public.posts ((link_preview ->> 'url'))
  where post_type = 'media_article';

drop policy if exists "media articles require app admin" on public.posts;

create policy "media articles require app admin"
  on public.posts
  as restrictive
  for insert
  to authenticated
  with check (
    post_type <> 'media_article'
    or public.is_app_admin()
  );
