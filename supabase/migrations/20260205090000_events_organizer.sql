-- Add organizer fields to events and update RLS

alter table public.events
  add column if not exists creator_user_id uuid,
  add column if not exists organizer_type text,
  add column if not exists organizer_id uuid;

-- Backfill from existing columns
update public.events
set
  creator_user_id = coalesce(creator_user_id, created_by),
  organizer_type = coalesce(
    organizer_type,
    case when organizer_group_id is not null then 'community' else 'fan' end
  ),
  organizer_id = coalesce(organizer_id, organizer_group_id, created_by)
where creator_user_id is null
   or organizer_type is null
   or organizer_id is null;

-- Enforce NOT NULL constraints
alter table public.events
  alter column creator_user_id set not null,
  alter column organizer_type set not null,
  alter column organizer_id set not null;

-- Ensure organizer_type is valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_organizer_type_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_organizer_type_check
      CHECK (organizer_type IN ('fan', 'community'));
  END IF;
END $$;

-- Update RLS policies
DROP POLICY IF EXISTS "Allow authenticated users to create events" ON public.events;
DROP POLICY IF EXISTS "Allow creators to update their own events" ON public.events;
DROP POLICY IF EXISTS "Allow creators to delete their own events" ON public.events;

-- Authenticated users can create events if they set creator_user_id = auth.uid()
CREATE POLICY "Events: insert by authenticated" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_user_id);

-- Update allowed for creator, app admin, or community owner/admin
CREATE POLICY "Events: update by owner/admin" ON public.events
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = creator_user_id
    OR EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid())
    OR (
      organizer_type = 'community'
      AND EXISTS (
        SELECT 1
        FROM public.community_members cm
        WHERE cm.community_id = organizer_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner','admin')
      )
    )
  )
  WITH CHECK (
    auth.uid() = creator_user_id
    OR EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid())
    OR (
      organizer_type = 'community'
      AND EXISTS (
        SELECT 1
        FROM public.community_members cm
        WHERE cm.community_id = organizer_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner','admin')
      )
    )
  );

-- Delete allowed for creator, app admin, or community owner/admin
CREATE POLICY "Events: delete by owner/admin" ON public.events
  FOR DELETE TO authenticated
  USING (
    auth.uid() = creator_user_id
    OR EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid())
    OR (
      organizer_type = 'community'
      AND EXISTS (
        SELECT 1
        FROM public.community_members cm
        WHERE cm.community_id = organizer_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner','admin')
      )
    )
  );
