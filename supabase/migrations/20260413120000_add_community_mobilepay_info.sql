alter table public.communities
  add column if not exists mobilepay_info text null,
  add column if not exists mobilepay_instructions text null;
