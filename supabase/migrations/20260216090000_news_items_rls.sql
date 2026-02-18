alter table public.news_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_items'
      and policyname = 'news_items_select_authenticated'
  ) then
    create policy news_items_select_authenticated
      on public.news_items
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_items'
      and policyname = 'news_items_insert_own'
  ) then
    create policy news_items_insert_own
      on public.news_items
      for insert
      to authenticated
      with check (created_by = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_items'
      and policyname = 'news_items_update_owner_or_admin'
  ) then
    create policy news_items_update_owner_or_admin
      on public.news_items
      for update
      to authenticated
      using (created_by = auth.uid() or public.is_app_admin())
      with check (created_by = auth.uid() or public.is_app_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_items'
      and policyname = 'news_items_delete_owner_or_admin'
  ) then
    create policy news_items_delete_owner_or_admin
      on public.news_items
      for delete
      to authenticated
      using (created_by = auth.uid() or public.is_app_admin());
  end if;
end $$;
