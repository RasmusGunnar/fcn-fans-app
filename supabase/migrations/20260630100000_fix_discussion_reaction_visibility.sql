-- Make discussion reactions use one explicit visible-target check for both root posts and replies.
-- This keeps reaction writes scoped to visible Debat posts while avoiding policy subquery drift.

create or replace function public.discussion_reaction_target_is_visible(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.discussion_posts post
    join public.discussion_threads thread on thread.id = post.thread_id
    where post.id = p_post_id
      and thread.deleted_at is null
      and (
        (post.deleted_at is null and post.hidden_at is null)
        or public.is_app_admin()
      )
  );
$$;

revoke all on function public.discussion_reaction_target_is_visible(uuid) from public;
revoke all on function public.discussion_reaction_target_is_visible(uuid) from anon;
grant execute on function public.discussion_reaction_target_is_visible(uuid) to authenticated;

drop policy if exists "discussion reactions read visible" on public.discussion_reactions;
create policy "discussion reactions read visible"
  on public.discussion_reactions for select
  using (
    auth.role() = 'authenticated'
    and public.discussion_reaction_target_is_visible(post_id)
  );

drop policy if exists "discussion reactions insert own" on public.discussion_reactions;
create policy "discussion reactions insert own"
  on public.discussion_reactions for insert
  with check (
    auth.uid() = user_id
    and reaction_type = 'like'
    and public.discussion_reaction_target_is_visible(post_id)
  );

drop policy if exists "discussion reactions delete own" on public.discussion_reactions;
create policy "discussion reactions delete own"
  on public.discussion_reactions for delete
  using (auth.uid() = user_id or public.is_app_admin());
