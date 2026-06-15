alter table public.posts
  add column if not exists post_type text not null default 'post';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_post_type_check'
  ) then
    alter table public.posts
      add constraint posts_post_type_check
      check (post_type in ('post', 'media_article'))
      not valid;
  end if;
end
$$;

alter table public.posts
  validate constraint posts_post_type_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_media_article_link_preview_url_check'
  ) then
    alter table public.posts
      add constraint posts_media_article_link_preview_url_check
      check (
        post_type <> 'media_article'
        or coalesce(
          jsonb_typeof(link_preview) = 'object'
          and jsonb_typeof(link_preview -> 'url') = 'string'
          and btrim(link_preview ->> 'url') ~* '^https?://[^[:space:]]+$',
          false
        )
      )
      not valid;
  end if;
end
$$;

alter table public.posts
  validate constraint posts_media_article_link_preview_url_check;

comment on column public.posts.post_type is
  'Post presentation subtype. media_article remains a post for feed and engagement identity.';
