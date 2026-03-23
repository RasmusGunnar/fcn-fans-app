-- Schedule template for push notification v1 jobs.
--
-- Replace:
--   <YOUR_PROJECT_REF>
--   <YOUR_SYNC_SECRET>
--
-- Suggested cadence:
--   - Match reminders: every 15 minutes
--   - Event reminders: every 15 minutes
--   - Hot posts: every 30 minutes

select cron.unschedule('push-match-reminders');
select cron.unschedule('push-event-reminders');
select cron.unschedule('push-hot-posts');

select cron.schedule(
  'push-match-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/push_match_reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', '<YOUR_SYNC_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'push-event-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/push_event_reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', '<YOUR_SYNC_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'push-hot-posts',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/push_hot_posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', '<YOUR_SYNC_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
