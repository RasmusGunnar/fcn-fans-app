-- Fix cron job for sync_fcn_fixtures: remove Authorization/apikey headers,
-- use only x-sync-secret for authentication (JWT verification is disabled
-- via config.toml verify_jwt = false).
--
-- Replace <YOUR_SYNC_SECRET> with the actual value of SYNC_SECRET.
-- Replace <YOUR_PROJECT_REF> with your Supabase project ref.
--
-- Run via: Supabase Dashboard → SQL Editor → paste → Run.

SELECT cron.unschedule('sync-fcn-upcoming');

SELECT cron.schedule(
  'sync-fcn-upcoming',
  '0 */6 * * *',  -- every 6 hours
  $$
  SELECT net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/sync_fcn_fixtures',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', '<YOUR_SYNC_SECRET>'
    ),
    body := jsonb_build_object(
      'job_name', 'fixtures_fcn_upcoming'
    )
  );
  $$
);
