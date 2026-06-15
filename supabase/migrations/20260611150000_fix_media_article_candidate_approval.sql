create or replace function public.approve_media_article_candidate(
  p_candidate_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_candidate public.media_article_candidates%rowtype;
  v_post_id uuid;
  v_link_preview jsonb;
  v_stage text := 'authorization';
  v_error_detail text;
  v_error_hint text;
  v_error_context text;
begin
  if v_user_id is null or not public.is_app_admin() then
    raise exception 'app admin required' using errcode = '42501';
  end if;

  v_stage := 'candidate_lock';

  select *
  into v_candidate
  from public.media_article_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'media article candidate not found' using errcode = 'P0002';
  end if;

  if v_candidate.status <> 'pending' then
    raise exception 'only pending media article candidates can be approved'
      using errcode = '23514';
  end if;

  if btrim(v_candidate.canonical_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'media article candidate has an invalid canonical URL'
      using errcode = '23514';
  end if;

  if nullif(btrim(v_candidate.title), '') is null then
    raise exception 'media article candidate requires a title'
      using errcode = '23514';
  end if;

  if nullif(btrim(v_candidate.source_name), '') is null then
    raise exception 'media article candidate requires a source name'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_candidate.canonical_url, 0));

  if exists (
    select 1
    from public.posts
    where post_type = 'media_article'
      and link_preview ->> 'url' = v_candidate.canonical_url
  ) then
    raise exception 'media article URL already published'
      using errcode = '23505';
  end if;

  v_link_preview := jsonb_strip_nulls(
    jsonb_build_object(
      'url', v_candidate.canonical_url,
      'title', btrim(v_candidate.title),
      'description', nullif(btrim(coalesce(v_candidate.description, '')), ''),
      'imageUrl', nullif(btrim(coalesce(v_candidate.image_url, '')), ''),
      'siteName', btrim(v_candidate.source_name)
    )
  );

  v_stage := 'post_insert';

  -- feed_targets is jsonb on the hosted project and text[] on fresh local
  -- databases. Both schemas default to Home, so omitting the column keeps this
  -- function compatible with both representations.
  insert into public.posts (
    author_id,
    actor_type,
    actor_id,
    post_type,
    text,
    media,
    link_preview
  )
  values (
    v_user_id,
    'user',
    v_user_id,
    'media_article',
    btrim(coalesce(v_candidate.caption, '')),
    '[]'::jsonb,
    v_link_preview
  )
  returning id into v_post_id;

  v_stage := 'post_validation';

  if not exists (
    select 1
    from public.posts p
    where p.id = v_post_id
      and p.post_type = 'media_article'
      and p.link_preview ->> 'url' = v_candidate.canonical_url
      and to_jsonb(p.feed_targets) @> '["home"]'::jsonb
  ) then
    raise exception 'created media article post failed contract validation'
      using
        errcode = '23514',
        detail = 'Expected post_type=media_article, link_preview.url=canonical_url and feed_targets containing home.';
  end if;

  v_stage := 'candidate_update';

  update public.media_article_candidates
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = v_user_id,
    published_post_id = v_post_id
  where id = v_candidate.id
    and status = 'pending';

  if not found then
    raise exception 'candidate status changed before approval completed'
      using errcode = '40001';
  end if;

  return v_post_id;
exception
  when others then
    get stacked diagnostics
      v_error_detail = pg_exception_detail,
      v_error_hint = pg_exception_hint,
      v_error_context = pg_exception_context;

    raise using
      errcode = sqlstate,
      message = format(
        'media article approval failed at %s: %s',
        v_stage,
        sqlerrm
      ),
      detail = concat_ws(
        '; ',
        format('candidate_id=%s', coalesce(p_candidate_id::text, '<null>')),
        nullif(v_error_detail, ''),
        nullif(v_error_context, '')
      ),
      hint = coalesce(
        nullif(v_error_hint, ''),
        format('Approval stage: %s', v_stage)
      );
end;
$$;

revoke all on function public.approve_media_article_candidate(uuid) from public;
revoke all on function public.approve_media_article_candidate(uuid) from anon;
grant execute on function public.approve_media_article_candidate(uuid) to authenticated;

comment on function public.approve_media_article_candidate(uuid) is
  'Atomically publishes a pending candidate as a normal media_article post. Compatible with jsonb and text[] feed_targets schemas.';
