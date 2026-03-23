-- Schedule template for the sync_fan_levels edge function.
--
-- Replace:
--   <YOUR_PROJECT_REF>
--   <YOUR_SYNC_SECRET>
--
-- Manual prod step:
--   Replace both placeholders, make sure the sync_fan_levels Edge Function is
--   deployed, and set SYNC_SECRET in Supabase secrets before running this SQL.
--
-- Timezone assumption:
--   Supabase pg_cron commonly runs on UTC.
--   This runs once daily at 02:15 UTC.
--   The function recomputes cumulative fan status for all existing profiles and
--   writes profiles.fan_level_key only when the mapped level changes.

select cron.unschedule('sync-fan-levels');

select cron.schedule(
  'sync-fan-levels',
  '15 2 * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/sync_fan_levels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', '<YOUR_SYNC_SECRET>'
    ),
    body := jsonb_build_object(
      'job_name', 'sync_fan_levels'
    )
  );
  $$
);
