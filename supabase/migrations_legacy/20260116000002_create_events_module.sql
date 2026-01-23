-- =====================================================
-- Events Module Migration
-- Adds fan_groups, bus_trips, and events tables
-- =====================================================

-- 1. Fan Groups (organizers)
CREATE TABLE IF NOT EXISTS public.fan_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bus Trips (can be linked to fixtures)
CREATE TABLE IF NOT EXISTS public.bus_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  expected_return_at TIMESTAMPTZ,
  departure_place TEXT NOT NULL,
  departure_address TEXT,
  price_dkk INT,
  total_seats INT NOT NULL DEFAULT 50,
  seats_taken INT NOT NULL DEFAULT 0,
  includes TEXT[],
  organizer_group_id UUID REFERENCES public.fan_groups(id) ON DELETE SET NULL,
  fixture_id UUID REFERENCES public.fixtures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Events (free-form events)
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  location_name TEXT,
  location_address TEXT,
  organizer_group_id UUID REFERENCES public.fan_groups(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- RLS Policies (Public Read, Authenticated Write)
-- =====================================================

-- Enable RLS
ALTER TABLE public.fan_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Fan Groups: Public Read
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow public read access to fan_groups"
      ON public.fan_groups FOR SELECT
      USING (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow public read access to fan_groups" already exists, skipping';
  END;
END $$;

-- Bus Trips: Public Read
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow public read access to bus_trips"
      ON public.bus_trips FOR SELECT
      USING (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow public read access to bus_trips" already exists, skipping';
  END;
END $$;

-- Bus Trips: Authenticated users can create (TODO: restrict to organizer members)
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow authenticated users to create bus_trips"
      ON public.bus_trips FOR INSERT
      TO authenticated
      WITH CHECK (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow authenticated users to create bus_trips" already exists, skipping';
  END;
END $$;

-- Bus Trips: Organizers can update their own trips (TODO: check group membership)
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow organizers to update bus_trips"
      ON public.bus_trips FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow organizers to update bus_trips" already exists, skipping';
  END;
END $$;

-- Events: Public Read
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow public read access to events"
      ON public.events FOR SELECT
      USING (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow public read access to events" already exists, skipping';
  END;
END $$;

-- Events: Authenticated users can create
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow authenticated users to create events"
      ON public.events FOR INSERT
      TO authenticated
      WITH CHECK (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow authenticated users to create events" already exists, skipping';
  END;
END $$;

-- Events: Creators can update their own events
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow creators to update their own events"
      ON public.events FOR UPDATE
      TO authenticated
      USING (auth.uid() = created_by)
      WITH CHECK (auth.uid() = created_by)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow creators to update their own events" already exists, skipping';
  END;
END $$;

-- Events: Creators can delete their own events
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Allow creators to delete their own events"
      ON public.events FOR DELETE
      TO authenticated
      USING (auth.uid() = created_by)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "Allow creators to delete their own events" already exists, skipping';
  END;
END $$;

-- =====================================================
-- Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_bus_trips_start_at ON public.bus_trips(start_at);
CREATE INDEX IF NOT EXISTS idx_bus_trips_fixture_id ON public.bus_trips(fixture_id);
CREATE INDEX IF NOT EXISTS idx_bus_trips_organizer ON public.bus_trips(organizer_group_id);

CREATE INDEX IF NOT EXISTS idx_events_start_at ON public.events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON public.events(organizer_group_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events(created_by);

-- =====================================================
-- Updated_at Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bus_trips_updated_at
  BEFORE UPDATE ON public.bus_trips
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
