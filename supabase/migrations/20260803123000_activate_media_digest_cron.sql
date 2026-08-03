-- MANUAL ACTIVATION ONLY: do not deploy this migration until the media-digest
-- state, Edge Function, Vault secrets, and smoke tests have been approved.
--
-- Job: push-media-digest-cph-18-hourly
-- Schedule: minute 0 of every UTC hour. The SQL and Edge Function guards dispatch
-- only at 18:00 Europe/Copenhagen (17:00 UTC in winter, 16:00 UTC in summer).
-- Required Vault secrets: project_url and sync_secret.
-- Rollback/disable:
--   select cron.unschedule(jobid)
--   from cron.job
--   where jobname = 'push-media-digest-cph-18-hourly';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'push-media-digest-cph-18-hourly';

select cron.schedule(
  'push-media-digest-cph-18-hourly',
  '0 * * * *',
  $cron$
    with runtime_settings as (
      select
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_url'
          limit 1
        ) as supabase_url,
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'sync_secret'
          limit 1
        ) as sync_secret
    )
    select net.http_post(
      url := runtime_settings.supabase_url || '/functions/v1/push_media_digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', runtime_settings.sync_secret
      ),
      body := '{}'::jsonb
    )
    from runtime_settings
    where runtime_settings.supabase_url is not null
      and runtime_settings.sync_secret is not null
      and extract(hour from now() at time zone 'Europe/Copenhagen') = 18;
  $cron$
);
