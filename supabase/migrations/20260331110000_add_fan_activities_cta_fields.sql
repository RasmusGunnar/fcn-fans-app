alter table if exists public.fan_activities
  add column if not exists cta_label text null;

alter table if exists public.fan_activities
  add column if not exists cta_url text null;
