-- Add organizer, contact_info, and created_by columns to bus_trips table
ALTER TABLE public.bus_trips 
  ADD COLUMN IF NOT EXISTS organizer TEXT,
  ADD COLUMN IF NOT EXISTS contact_info TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
