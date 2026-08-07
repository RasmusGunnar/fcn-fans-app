-- DM V1.5: backward-compatible group conversations, active membership,
-- generic conversation reads, group administration, and metadata-only reports.

alter table public.conversations
  add column if not exists conversation_type text not null default 'direct',
  add column if not exists name text,
  add column if not exists avatar_path text;

alter table public.conversations
  alter column user_low_id drop not null,
  alter column user_high_id drop not null;

alter table public.conversations
  drop constraint if exists conversations_distinct_users_check,
  drop constraint if exists conversations_canonical_pair_check,
  drop constraint if exists conversations_creator_participant_check,
  drop constraint if exists conversations_direct_pair_unique,
  drop constraint if exists conversations_type_check,
  drop constraint if exists conversations_shape_check,
  drop constraint if exists conversations_name_check,
  drop constraint if exists conversations_avatar_path_check;

alter table public.conversations
  add constraint conversations_type_check
    check (conversation_type in ('direct', 'group')),
  add constraint conversations_shape_check check (
    (
      conversation_type = 'direct'
      and user_low_id is not null
      and user_high_id is not null
      and user_low_id < user_high_id
      and (created_by is null or created_by in (user_low_id, user_high_id))
    )
    or
    (
      conversation_type = 'group'
      and user_low_id is null
      and user_high_id is null
      and created_by is not null
    )
  ),
  add constraint conversations_name_check check (
    (conversation_type = 'direct' and (name is null or char_length(btrim(name)) between 1 and 80))
    or (conversation_type = 'group' and char_length(btrim(name)) between 1 and 80)
  ),
  add constraint conversations_avatar_path_check check (
    avatar_path is null
    or avatar_path ~ (
      '^groups/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
    )
  );

create unique index conversations_direct_pair_unique
  on public.conversations (user_low_id, user_high_id)
  where conversation_type = 'direct';

create index if not exists conversations_group_activity_idx
  on public.conversations (last_message_at desc, created_at desc, id desc)
  where conversation_type = 'group';

alter table public.conversation_members
  add column if not exists role text not null default 'member',
  add column if not exists left_at timestamptz,
  add column if not exists removed_at timestamptz,
  add column if not exists added_by uuid references public.profiles(id) on delete set null;

alter table public.conversation_members
  drop constraint if exists conversation_members_role_check,
  drop constraint if exists conversation_members_exit_check;

alter table public.conversation_members
  add constraint conversation_members_role_check
    check (role in ('owner', 'admin', 'member')),
  add constraint conversation_members_exit_check
    check (left_at is null or removed_at is null);

create index if not exists conversation_members_active_user_idx
  on public.conversation_members (user_id, conversation_id)
  where left_at is null and removed_at is null;

create index if not exists conversation_members_active_conversation_idx
  on public.conversation_members (conversation_id, role, joined_at, user_id)
  where left_at is null and removed_at is null;

alter table public.direct_message_reports
  alter column reported_user_id drop not null,
  add column if not exists report_target_type text not null default 'user';

alter table public.direct_message_reports
  drop constraint if exists direct_message_reports_distinct_users_check,
  drop constraint if exists direct_message_reports_target_check;

alter table public.direct_message_reports
  add constraint direct_message_reports_target_check check (
    (report_target_type = 'user' and reported_user_id is not null and reporter_id <> reported_user_id)
    or (report_target_type = 'conversation' and reported_user_id is null)
  );

drop index if exists public.direct_message_reports_open_pair_idx;
create unique index direct_message_reports_open_user_target_idx
  on public.direct_message_reports (conversation_id, reporter_id, reported_user_id)
  where status = 'open' and report_target_type = 'user';
create unique index direct_message_reports_open_conversation_target_idx
  on public.direct_message_reports (conversation_id, reporter_id)
  where status = 'open' and report_target_type = 'conversation';

create or replace function public.is_conversation_active_member(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_conversation_id is null or p_user_id is null then
    return false;
  end if;

  if auth.role() <> 'service_role' and p_user_id is distinct from auth.uid() then
    return false;
  end if;

  return exists (
    select 1
    from public.conversation_members membership
    where membership.conversation_id = p_conversation_id
      and membership.user_id = p_user_id
      and membership.left_at is null
      and membership.removed_at is null
  );
end;
$$;

create or replace function public.validate_conversation_member_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.conversations%rowtype;
  v_active_count integer;
begin
  select conversation.*
  into v_conversation
  from public.conversations conversation
  where conversation.id = new.conversation_id
  for update;

  if not found then
    raise exception 'message_conversation_not_found' using errcode = 'P0002';
  end if;

  if v_conversation.conversation_type = 'direct' then
    if new.user_id not in (v_conversation.user_low_id, v_conversation.user_high_id)
      or new.role <> 'member'
      or new.left_at is not null
      or new.removed_at is not null then
      raise exception 'direct_message_invalid_member' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.left_at is null and new.removed_at is null then
    if tg_op = 'INSERT' then
      select count(*)::integer
      into v_active_count
      from public.conversation_members membership
      where membership.conversation_id = new.conversation_id
        and membership.left_at is null
        and membership.removed_at is null;
    else
      select count(*)::integer
      into v_active_count
      from public.conversation_members membership
      where membership.conversation_id = new.conversation_id
        and membership.left_at is null
        and membership.removed_at is null
        and (membership.conversation_id, membership.user_id)
          <> (old.conversation_id, old.user_id);
    end if;

    if v_active_count >= 10 then
      raise exception 'group_member_limit' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists conversation_members_validate_participant on public.conversation_members;
drop trigger if exists conversation_members_validate_v2 on public.conversation_members;
create trigger conversation_members_validate_v2
before insert or update on public.conversation_members
for each row execute function public.validate_conversation_member_v2();

create or replace function public.transfer_group_owner_on_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_type text;
  v_next_owner_id uuid;
begin
  if old.role <> 'owner' then
    return old;
  end if;

  select conversation.conversation_type
  into v_conversation_type
  from public.conversations conversation
  where conversation.id = old.conversation_id;

  if v_conversation_type <> 'group' then
    return old;
  end if;

  select membership.user_id
  into v_next_owner_id
  from public.conversation_members membership
  where membership.conversation_id = old.conversation_id
    and membership.user_id <> old.user_id
    and membership.left_at is null
    and membership.removed_at is null
  order by (membership.role = 'admin') desc, membership.joined_at, membership.user_id
  limit 1;

  if v_next_owner_id is null then
    delete from public.conversations where id = old.conversation_id;
    return null;
  end if;

  update public.conversation_members
  set role = 'owner'
  where conversation_id = old.conversation_id and user_id = v_next_owner_id;

  update public.conversations
  set created_by = v_next_owner_id, updated_at = now()
  where id = old.conversation_id;

  return old;
end;
$$;

drop trigger if exists conversation_members_transfer_owner_delete on public.conversation_members;
create trigger conversation_members_transfer_owner_delete
before delete on public.conversation_members
for each row execute function public.transfer_group_owner_on_member_delete();

create or replace function public.transfer_owned_groups_before_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group record;
  v_next_owner_id uuid;
begin
  for v_group in
    select conversation.id
    from public.conversations conversation
    where conversation.conversation_type = 'group'
      and conversation.created_by = old.id
    for update
  loop
    select membership.user_id
    into v_next_owner_id
    from public.conversation_members membership
    where membership.conversation_id = v_group.id
      and membership.user_id <> old.id
      and membership.left_at is null
      and membership.removed_at is null
    order by (membership.role = 'admin') desc, membership.joined_at, membership.user_id
    limit 1;

    if v_next_owner_id is null then
      update public.conversation_members
      set role = 'member'
      where conversation_id = v_group.id and user_id = old.id;

      delete from public.conversations where id = v_group.id;
    else
      update public.conversation_members
      set role = 'member'
      where conversation_id = v_group.id and user_id = old.id;

      update public.conversation_members
      set role = 'owner'
      where conversation_id = v_group.id and user_id = v_next_owner_id;

      update public.conversations
      set created_by = v_next_owner_id, updated_at = now()
      where id = v_group.id;
    end if;
  end loop;

  return old;
end;
$$;

drop trigger if exists profiles_transfer_owned_groups_delete on public.profiles;
create trigger profiles_transfer_owned_groups_delete
before delete on public.profiles
for each row execute function public.transfer_owned_groups_before_profile_delete();

drop policy if exists conversations_select_participant on public.conversations;
drop policy if exists conversations_select_active_member on public.conversations;
create policy conversations_select_active_member
  on public.conversations for select
  to authenticated
  using (
    (conversation_type = 'direct' and auth.uid() in (user_low_id, user_high_id))
    or
    (conversation_type = 'group' and public.is_conversation_active_member(id, auth.uid()))
  );

drop policy if exists conversation_members_select_conversation on public.conversation_members;
drop policy if exists conversation_members_select_active_conversation on public.conversation_members;
create policy conversation_members_select_active_conversation
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_active_member(conversation_id, auth.uid()));

drop policy if exists messages_select_participant on public.messages;
drop policy if exists messages_select_active_member on public.messages;
create policy messages_select_active_member
  on public.messages for select
  to authenticated
  using (public.is_conversation_active_member(conversation_id, auth.uid()));

-- The V1 RPC must name the partial direct-pair predicate for ON CONFLICT.
create or replace function public.create_or_get_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_low_user_id uuid;
  v_high_user_id uuid;
  v_conversation_id uuid;
  v_recent_conversations integer;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'direct_message_self_conversation' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_other_user_id) then
    raise exception 'direct_message_user_not_found' using errcode = 'P0002';
  end if;
  if public.direct_message_users_blocked(v_user_id, p_other_user_id) then
    raise exception 'direct_message_blocked' using errcode = '42501';
  end if;

  v_low_user_id := least(v_user_id, p_other_user_id);
  v_high_user_id := greatest(v_user_id, p_other_user_id);

  select conversation.id
  into v_conversation_id
  from public.conversations conversation
  where conversation.conversation_type = 'direct'
    and conversation.user_low_id = v_low_user_id
    and conversation.user_high_id = v_high_user_id;

  if v_conversation_id is null then
    select count(*)::integer
    into v_recent_conversations
    from public.conversations conversation
    where conversation.conversation_type = 'direct'
      and conversation.created_by = v_user_id
      and conversation.created_at > now() - interval '10 minutes';

    if v_recent_conversations >= 10 then
      raise exception 'direct_message_conversation_rate_limited' using errcode = 'P0001';
    end if;

    insert into public.conversations (
      conversation_type,
      user_low_id,
      user_high_id,
      created_by
    ) values ('direct', v_low_user_id, v_high_user_id, v_user_id)
    on conflict (user_low_id, user_high_id)
      where conversation_type = 'direct'
      do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select conversation.id
      into v_conversation_id
      from public.conversations conversation
      where conversation.conversation_type = 'direct'
        and conversation.user_low_id = v_low_user_id
        and conversation.user_high_id = v_high_user_id;
    end if;
  end if;

  delete from public.conversation_members member
  where member.conversation_id = v_conversation_id
    and member.user_id not in (v_low_user_id, v_high_user_id);

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role,
    left_at,
    removed_at
  ) values
    (v_conversation_id, v_low_user_id, 'member', null, null),
    (v_conversation_id, v_high_user_id, 'member', null, null)
  on conflict (conversation_id, user_id) do update
    set role = 'member', left_at = null, removed_at = null;

  return v_conversation_id;
end;
$$;

create or replace function public.create_group_conversation(
  p_name text,
  p_member_user_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_member_ids uuid[];
  v_member_count integer;
  v_existing_count integer;
  v_recent_groups integer;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'group_name_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(candidate.user_id order by candidate.user_id), '{}'::uuid[])
  into v_member_ids
  from (
    select distinct member_id as user_id
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) member_id
    where member_id is not null and member_id <> v_user_id
  ) candidate;

  v_member_count := cardinality(v_member_ids);
  if v_member_count < 1 or v_member_count > 9 then
    raise exception 'group_member_count_invalid' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_existing_count
  from public.profiles profile
  where profile.id = any(v_member_ids);

  if v_existing_count <> v_member_count then
    raise exception 'direct_message_user_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from unnest(v_member_ids) member_id
    where public.direct_message_users_blocked(v_user_id, member_id)
  ) then
    raise exception 'direct_message_blocked' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_recent_groups
  from public.conversations conversation
  where conversation.conversation_type = 'group'
    and conversation.created_by = v_user_id
    and conversation.created_at > now() - interval '10 minutes';

  if v_recent_groups >= 5 then
    raise exception 'group_conversation_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.conversations (
    conversation_type,
    name,
    created_by,
    user_low_id,
    user_high_id
  )
  values ('group', v_name, v_user_id, null, null)
  returning id into v_conversation_id;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role,
    added_by
  )
  values (v_conversation_id, v_user_id, 'owner', v_user_id);

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role,
    added_by
  )
  select v_conversation_id, member_id, 'member', v_user_id
  from unnest(v_member_ids) member_id;

  return v_conversation_id;
end;
$$;

create or replace function public.add_group_members(
  p_conversation_id uuid,
  p_member_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role text;
  v_member_ids uuid[];
  v_requested_count integer;
  v_existing_profiles integer;
  v_active_count integer;
  v_added integer := 0;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  select membership.role
  into v_actor_role
  from public.conversation_members membership
  join public.conversations conversation on conversation.id = membership.conversation_id
  where membership.conversation_id = p_conversation_id
    and membership.user_id = v_user_id
    and conversation.conversation_type = 'group'
    and membership.left_at is null
    and membership.removed_at is null
  for update of conversation;

  if v_actor_role not in ('owner', 'admin') then
    raise exception 'group_admin_required' using errcode = '42501';
  end if;

  select coalesce(array_agg(candidate.user_id order by candidate.user_id), '{}'::uuid[])
  into v_member_ids
  from (
    select distinct member_id as user_id
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) member_id
    where member_id is not null and member_id <> v_user_id
  ) candidate;

  v_requested_count := cardinality(v_member_ids);
  if v_requested_count < 1 then
    raise exception 'group_member_count_invalid' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_existing_profiles
  from public.profiles profile
  where profile.id = any(v_member_ids);

  if v_existing_profiles <> v_requested_count then
    raise exception 'direct_message_user_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from unnest(v_member_ids) member_id
    where public.direct_message_users_blocked(v_user_id, member_id)
  ) then
    raise exception 'direct_message_blocked' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_active_count
  from public.conversation_members membership
  where membership.conversation_id = p_conversation_id
    and membership.left_at is null
    and membership.removed_at is null;

  select count(*)::integer
  into v_added
  from unnest(v_member_ids) member_id
  where not exists (
    select 1 from public.conversation_members membership
    where membership.conversation_id = p_conversation_id
      and membership.user_id = member_id
      and membership.left_at is null
      and membership.removed_at is null
  );

  if v_active_count + v_added > 10 then
    raise exception 'group_member_limit' using errcode = '22023';
  end if;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role,
    joined_at,
    left_at,
    removed_at,
    archived_at,
    added_by
  )
  select p_conversation_id, member_id, 'member', now(), null, null, null, v_user_id
  from unnest(v_member_ids) member_id
  on conflict (conversation_id, user_id) do update
    set role = 'member',
        joined_at = now(),
        left_at = null,
        removed_at = null,
        archived_at = null,
        last_read_at = null,
        last_read_message_id = null,
        added_by = v_user_id
    where conversation_members.left_at is not null
       or conversation_members.removed_at is not null;

  update public.conversations set updated_at = now() where id = p_conversation_id;
  return v_added;
end;
$$;

create or replace function public.remove_group_member(
  p_conversation_id uuid,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  if p_member_user_id is null or p_member_user_id = v_user_id then
    raise exception 'group_remove_target_invalid' using errcode = '22023';
  end if;

  select membership.role
  into v_actor_role
  from public.conversation_members membership
  join public.conversations conversation on conversation.id = membership.conversation_id
  where membership.conversation_id = p_conversation_id
    and membership.user_id = v_user_id
    and conversation.conversation_type = 'group'
    and membership.left_at is null
    and membership.removed_at is null
  for update of conversation;

  select membership.role
  into v_target_role
  from public.conversation_members membership
  where membership.conversation_id = p_conversation_id
    and membership.user_id = p_member_user_id
    and membership.left_at is null
    and membership.removed_at is null;

  if v_actor_role not in ('owner', 'admin') or v_target_role is null then
    raise exception 'group_admin_required' using errcode = '42501';
  end if;
  if v_target_role = 'owner' or (v_actor_role = 'admin' and v_target_role <> 'member') then
    raise exception 'group_role_forbidden' using errcode = '42501';
  end if;

  update public.conversation_members
  set removed_at = now(), left_at = null, archived_at = now()
  where conversation_id = p_conversation_id and user_id = p_member_user_id;

  update public.conversations set updated_at = now() where id = p_conversation_id;
end;
$$;

create or replace function public.leave_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  select membership.role
  into v_role
  from public.conversation_members membership
  join public.conversations conversation on conversation.id = membership.conversation_id
  where membership.conversation_id = p_conversation_id
    and membership.user_id = v_user_id
    and conversation.conversation_type = 'group'
    and membership.left_at is null
    and membership.removed_at is null
  for update of conversation;

  if v_role is null then
    raise exception 'message_conversation_not_found' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'group_owner_cannot_leave' using errcode = '42501';
  end if;

  update public.conversation_members
  set left_at = now(), removed_at = null, archived_at = now()
  where conversation_id = p_conversation_id and user_id = v_user_id;

  update public.conversations set updated_at = now() where id = p_conversation_id;
end;
$$;

create or replace function public.update_group_metadata(
  p_conversation_id uuid,
  p_name text default null,
  p_avatar_path text default null,
  p_clear_avatar boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_name text := case when p_name is null then null else regexp_replace(btrim(p_name), '[[:space:]]+', ' ', 'g') end;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;

  select membership.role
  into v_role
  from public.conversation_members membership
  join public.conversations conversation on conversation.id = membership.conversation_id
  where membership.conversation_id = p_conversation_id
    and membership.user_id = v_user_id
    and conversation.conversation_type = 'group'
    and membership.left_at is null
    and membership.removed_at is null
  for update of conversation;

  if v_role not in ('owner', 'admin') then
    raise exception 'group_admin_required' using errcode = '42501';
  end if;
  if v_name is not null and (char_length(v_name) < 1 or char_length(v_name) > 80) then
    raise exception 'group_name_invalid' using errcode = '22023';
  end if;

  update public.conversations
  set name = coalesce(v_name, name),
      avatar_path = case when p_clear_avatar then null else coalesce(p_avatar_path, avatar_path) end,
      updated_at = now()
  where id = p_conversation_id;
end;
$$;

create or replace function public.update_group_member_role(
  p_conversation_id uuid,
  p_member_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_role text := lower(btrim(coalesce(p_role, '')));
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;
  if p_member_user_id is null or p_member_user_id = v_user_id
    or v_role not in ('admin', 'member') then
    raise exception 'group_role_forbidden' using errcode = '42501';
  end if;

  select membership.role
  into v_actor_role
  from public.conversation_members membership
  join public.conversations conversation on conversation.id = membership.conversation_id
  where membership.conversation_id = p_conversation_id
    and membership.user_id = v_user_id
    and conversation.conversation_type = 'group'
    and membership.left_at is null
    and membership.removed_at is null
  for update of conversation;

  select membership.role
  into v_target_role
  from public.conversation_members membership
  where membership.conversation_id = p_conversation_id
    and membership.user_id = p_member_user_id
    and membership.left_at is null
    and membership.removed_at is null;

  if v_actor_role <> 'owner' or v_target_role is null or v_target_role = 'owner' then
    raise exception 'group_role_forbidden' using errcode = '42501';
  end if;

  update public.conversation_members
  set role = v_role
  where conversation_id = p_conversation_id and user_id = p_member_user_id;

  update public.conversations set updated_at = now() where id = p_conversation_id;
end;
$$;

create or replace function public.get_conversation_details(p_conversation_id uuid)
returns table (
  conversation_id uuid,
  conversation_type text,
  conversation_name text,
  conversation_avatar_path text,
  peer_id uuid,
  peer_display_name text,
  peer_username text,
  peer_avatar_url text,
  last_message_at timestamptz,
  blocked boolean,
  blocked_by_me boolean,
  member_count integer,
  current_user_role text,
  peer_last_read_at timestamptz,
  peer_last_read_message_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    conversation.id,
    conversation.conversation_type,
    conversation.name,
    conversation.avatar_path,
    peer.id,
    peer.display_name,
    peer.username,
    peer.avatar_url,
    conversation.last_message_at,
    case when conversation.conversation_type = 'direct'
      then public.direct_message_users_blocked(auth.uid(), peer.id)
      else false
    end,
    case when conversation.conversation_type = 'direct' then exists (
      select 1 from public.user_blocks block_row
      where block_row.blocker_id = auth.uid() and block_row.blocked_id = peer.id
    ) else false end,
    (
      select count(*)::integer
      from public.conversation_members active_member
      where active_member.conversation_id = conversation.id
        and active_member.left_at is null
        and active_member.removed_at is null
    ),
    membership.role,
    peer_membership.last_read_at,
    peer_membership.last_read_message_id
  from public.conversations conversation
  join public.conversation_members membership
    on membership.conversation_id = conversation.id
   and membership.user_id = auth.uid()
   and membership.left_at is null
   and membership.removed_at is null
  left join public.profiles peer
    on conversation.conversation_type = 'direct'
   and peer.id = case
     when conversation.user_low_id = auth.uid() then conversation.user_high_id
     else conversation.user_low_id
   end
  left join public.conversation_members peer_membership
    on conversation.conversation_type = 'direct'
   and peer_membership.conversation_id = conversation.id
   and peer_membership.user_id = peer.id
  where auth.uid() is not null and conversation.id = p_conversation_id;
$$;

create or replace function public.get_group_members(p_conversation_id uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_active_member(p_conversation_id, auth.uid()) then
    raise exception 'message_conversation_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    membership.role,
    membership.joined_at
  from public.conversation_members membership
  join public.profiles profile on profile.id = membership.user_id
  join public.conversations conversation on conversation.id = membership.conversation_id
  where membership.conversation_id = p_conversation_id
    and conversation.conversation_type = 'group'
    and membership.left_at is null
    and membership.removed_at is null
  order by
    case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    coalesce(profile.display_name, profile.username, profile.id::text),
    profile.id;
end;
$$;

create or replace function public.mark_conversation_read(
  p_conversation_id uuid,
  p_last_loaded_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seen_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;
  if not public.is_conversation_active_member(p_conversation_id, v_user_id) then
    raise exception 'message_conversation_not_found' using errcode = 'P0002';
  end if;

  select message.created_at into v_seen_at
  from public.messages message
  where message.id = p_last_loaded_message_id
    and message.conversation_id = p_conversation_id;

  if v_seen_at is null then
    raise exception 'direct_message_last_loaded_not_found' using errcode = 'P0002';
  end if;

  update public.conversation_members membership
  set last_read_at = v_seen_at, last_read_message_id = p_last_loaded_message_id
  where membership.conversation_id = p_conversation_id
    and membership.user_id = v_user_id
    and (
      membership.last_read_at is null
      or v_seen_at > membership.last_read_at
      or (
        v_seen_at = membership.last_read_at
        and p_last_loaded_message_id > coalesce(
          membership.last_read_message_id,
          '00000000-0000-0000-0000-000000000000'::uuid
        )
      )
    );
end;
$$;

create or replace function public.conversation_unread_count_for_user(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.conversation_members membership
  join public.messages message on message.conversation_id = membership.conversation_id
  where membership.user_id = p_user_id
    and membership.left_at is null
    and membership.removed_at is null
    and message.sender_id <> p_user_id
    and message.deleted_at is null
    and (
      membership.last_read_at is null
      or message.created_at > membership.last_read_at
      or (
        message.created_at = membership.last_read_at
        and (
          membership.last_read_message_id is null
          or message.id > membership.last_read_message_id
        )
      )
    );
$$;

create or replace function public.direct_message_unread_count_for_user(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.conversation_unread_count_for_user(p_user_id);
$$;

create or replace function public.report_conversation(
  p_conversation_id uuid,
  p_report_target_type text,
  p_reported_user_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_type text := lower(btrim(coalesce(p_report_target_type, '')));
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_report_id uuid;
begin
  if v_user_id is null then
    raise exception 'direct_message_auth_required' using errcode = '42501';
  end if;
  if not public.is_conversation_active_member(p_conversation_id, v_user_id) then
    raise exception 'direct_message_report_forbidden' using errcode = '42501';
  end if;
  if v_target_type not in ('user', 'conversation') then
    raise exception 'direct_message_report_target_invalid' using errcode = '22023';
  end if;
  if v_reason not in ('spam', 'abuse', 'harassment', 'personal_info', 'other') then
    raise exception 'direct_message_report_reason_invalid' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'direct_message_report_note_too_long' using errcode = '22023';
  end if;

  if v_target_type = 'user' and (
    p_reported_user_id is null
    or p_reported_user_id = v_user_id
    or not exists (
      select 1 from public.conversation_members membership
      where membership.conversation_id = p_conversation_id
        and membership.user_id = p_reported_user_id
    )
  ) then
    raise exception 'direct_message_report_forbidden' using errcode = '42501';
  end if;

  select report.id into v_report_id
  from public.direct_message_reports report
  where report.conversation_id = p_conversation_id
    and report.reporter_id = v_user_id
    and report.report_target_type = v_target_type
    and report.reported_user_id is not distinct from case
      when v_target_type = 'user' then p_reported_user_id else null
    end
    and report.status = 'open'
  limit 1;

  if v_report_id is null then
    insert into public.direct_message_reports (
      reporter_id,
      reported_user_id,
      conversation_id,
      report_target_type,
      reason,
      note
    ) values (
      v_user_id,
      case when v_target_type = 'user' then p_reported_user_id else null end,
      p_conversation_id,
      v_target_type,
      v_reason,
      v_note
    ) returning id into v_report_id;
  end if;

  return v_report_id;
end;
$$;

-- Keep the V1 report RPC stable for existing clients.
create or replace function public.report_direct_message(
  p_conversation_id uuid,
  p_reported_user_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.report_conversation(
    p_conversation_id,
    'user',
    p_reported_user_id,
    p_reason,
    p_note
  );
$$;

-- Private typing channels use topic conversation:<uuid>:typing and are
-- authorized against active membership. No typing payload is persisted.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "conversation members receive typing" on realtime.messages';
    execute $policy$
      create policy "conversation members receive typing"
      on realtime.messages for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (select realtime.topic()) ~ '^conversation:[0-9a-f-]{36}:typing$'
        and public.is_conversation_active_member(
          split_part((select realtime.topic()), ':', 2)::uuid,
          auth.uid()
        )
      )
    $policy$;

    execute 'drop policy if exists "conversation members send typing" on realtime.messages';
    execute $policy$
      create policy "conversation members send typing"
      on realtime.messages for insert to authenticated
      with check (
        realtime.messages.extension = 'broadcast'
        and (select realtime.topic()) ~ '^conversation:[0-9a-f-]{36}:typing$'
        and public.is_conversation_active_member(
          split_part((select realtime.topic()), ':', 2)::uuid,
          auth.uid()
        )
      )
    $policy$;
  end if;
exception
  when insufficient_privilege then
    raise notice 'Could not create realtime typing policies; Realtime authorization must be configured before release.';
end $$;

revoke all on function public.is_conversation_active_member(uuid, uuid) from public, anon;
revoke all on function public.validate_conversation_member_v2() from public, anon, authenticated;
revoke all on function public.transfer_group_owner_on_member_delete() from public, anon, authenticated;
revoke all on function public.transfer_owned_groups_before_profile_delete()
  from public, anon, authenticated;
revoke all on function public.conversation_unread_count_for_user(uuid) from public, anon, authenticated;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.update_group_metadata(uuid, text, text, boolean) from public, anon;
revoke all on function public.update_group_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.get_conversation_details(uuid) from public, anon;
revoke all on function public.get_group_members(uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon;
revoke all on function public.report_conversation(uuid, text, uuid, text, text) from public, anon;

grant execute on function public.is_conversation_active_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.update_group_metadata(uuid, text, text, boolean) to authenticated;
grant execute on function public.update_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.get_conversation_details(uuid) to authenticated;
grant execute on function public.get_group_members(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated;
grant execute on function public.report_conversation(uuid, text, uuid, text, text) to authenticated;

comment on column public.conversation_members.left_at is
  'A left or removed member immediately loses conversation, message, media, and typing access.';
comment on function public.report_conversation(uuid, text, uuid, text, text) is
  'Creates metadata-only user or conversation reports. Message bodies and transcripts are never copied.';
