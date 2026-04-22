-- Schedule template for the weekly_top_fan edge function.
--
-- Replace:
--   <YOUR_PROJECT_REF>
--   <YOUR_SYNC_SECRET>
--
-- Manual prod step:
--   Replace both placeholders, make sure the weekly_top_fan Edge Function is
--   deployed, and set SYNC_SECRET in Supabase secrets before running this SQL.
--
-- Authoritative publish rule:
--   Publish one Weekly Top Fan snapshot every Wednesday at 12:00 Europe/Copenhagen.
--   The published card represents the previous completed Monday-based week.
--
-- Timezone assumption:
--   Supabase pg_cron commonly runs on UTC.
--   Europe/Copenhagen is UTC+1 in winter and UTC+2 in summer.
--   To keep "Wednesday 12:00 Europe/Copenhagen" stable across DST,
--   this cron calls the function at 10:00 UTC and 11:00 UTC every Wednesday.
--   The edge function itself only generates the card when the local
--   Copenhagen time is actually Wednesday 12:00, so only one run wins.
--   The function now scores the previous completed week using a fixed
--   [week_start_date, week_start_date + 7 days) interval.
--   Keep the cron body minimal; normal weekly production should not send an
--   explicit week_start_date.

select cron.unschedule('weekly-top-fan');

select cron.schedule(
  'weekly-top-fan',
  '0 10,11 * * 3',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/weekly_top_fan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', '<YOUR_SYNC_SECRET>'
    ),
    body := jsonb_build_object(
      'job_name', 'weekly_top_fan'
    )
  );
  $$
);
