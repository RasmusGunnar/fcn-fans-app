-- Schedule template for the weekly_top_fan edge function.
--
-- Replace:
--   <YOUR_PROJECT_REF>
--   <YOUR_SYNC_SECRET>
--
-- Timezone assumption:
--   Supabase pg_cron commonly runs on UTC.
--   Europe/Copenhagen is UTC+1 in winter and UTC+2 in summer.
--   To keep "Monday 12:00 Europe/Copenhagen" stable across DST,
--   this cron calls the function at 10:00 UTC and 11:00 UTC every Monday.
--   The edge function itself only generates the card when the local
--   Copenhagen time is actually Monday 12:00, so only one run wins.

select cron.unschedule('weekly-top-fan');

select cron.schedule(
  'weekly-top-fan',
  '0 10,11 * * 1',
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
