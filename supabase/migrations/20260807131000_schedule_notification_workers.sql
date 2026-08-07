-- Notification Engine v2 retry workers. This migration is intentionally
-- separate from the DM schema so scheduler activation can be reviewed and
-- rolled back independently.
--
-- Jobs:
--   notification-push-queue-every-minute
--   notification-push-receipts-every-3-minutes
-- Required Vault secrets: project_url and sync_secret.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'notification-push-queue-every-minute';

select cron.schedule(
  'notification-push-queue-every-minute',
  '* * * * *',
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
      url := runtime_settings.supabase_url || '/functions/v1/process_push_queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', runtime_settings.sync_secret
      ),
      body := '{"limit":25}'::jsonb
    )
    from runtime_settings
    where runtime_settings.supabase_url is not null
      and runtime_settings.sync_secret is not null;
  $cron$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'notification-push-receipts-every-3-minutes';

select cron.schedule(
  'notification-push-receipts-every-3-minutes',
  '*/3 * * * *',
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
      url := runtime_settings.supabase_url || '/functions/v1/poll_push_receipts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', runtime_settings.sync_secret
      ),
      body := '{"limit":25}'::jsonb
    )
    from runtime_settings
    where runtime_settings.supabase_url is not null
      and runtime_settings.sync_secret is not null;
  $cron$
);
