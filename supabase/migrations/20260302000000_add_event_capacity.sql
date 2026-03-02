-- Add capacity field to events table
-- NULL = unlimited, positive integer = limited capacity

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS capacity INTEGER NULL;

-- Add constraint to ensure capacity is positive when set
ALTER TABLE public.events
  ADD CONSTRAINT events_capacity_positive
  CHECK (capacity IS NULL OR capacity > 0);

COMMENT ON COLUMN public.events.capacity IS 'Event capacity limit. NULL means unlimited, positive integer means limited capacity.';
