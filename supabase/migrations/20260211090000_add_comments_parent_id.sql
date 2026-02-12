alter table public.comments_v2
  add column if not exists parent_id uuid null;

alter table public.comments_v2
  add constraint comments_v2_parent_id_fkey
  foreign key (parent_id) references public.comments_v2(id)
  on delete cascade;

create index if not exists comments_v2_target_parent_created_idx
  on public.comments_v2 (target_type, target_id, parent_id, created_at);
