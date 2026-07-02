-- Notification Engine v2 Phase B
-- Internal queue claim helper for process_push_queue. No cron or legacy push
-- conversion is introduced by this migration.

create or replace function public.claim_notification_jobs(
  p_limit integer,
  p_worker_id text,
  p_job_id uuid default null
)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 25);
  v_worker_id text := nullif(btrim(p_worker_id), '');
begin
  if v_worker_id is null then
    raise exception 'worker_id is required' using errcode = '22023';
  end if;

  return query
  with candidate_jobs as (
    select id
    from public.notification_jobs
    where status = 'queued'
      and next_attempt_at <= now()
      and attempt_count < max_attempts
      and (p_job_id is null or id = p_job_id)
    order by created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_jobs jobs
  set
    status = 'processing',
    locked_at = now(),
    locked_by = v_worker_id,
    attempt_count = jobs.attempt_count + 1,
    updated_at = now()
  from candidate_jobs
  where jobs.id = candidate_jobs.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_notification_jobs(integer, text, uuid) from public;
revoke all on function public.claim_notification_jobs(integer, text, uuid) from anon;
revoke all on function public.claim_notification_jobs(integer, text, uuid) from authenticated;
grant execute on function public.claim_notification_jobs(integer, text, uuid) to service_role;

comment on function public.claim_notification_jobs(integer, text, uuid) is
  'Notification Engine v2 internal claim helper. Claims queued jobs with FOR UPDATE SKIP LOCKED for service-role workers only.';
