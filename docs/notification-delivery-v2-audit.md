# Notification delivery v2 audit

Audit date: 2026-08-05. This document describes the repository state after the local delivery pass. Hosted scheduler state and physical-device delivery were not changed or tested.

## Shared delivery chain

Every v2 producer calls `enqueue_notification`. A unique `dedupe_key` makes a repeated enqueue return `inserted = false`; only newly inserted jobs are sent to `process_push_queue`. The processor claims queued jobs, loads active `push_devices`, creates one `notification_delivery` per device, sends an Expo payload with the unread badge count, `sound: default`, `channelId: default`, and navigation data, then stores the Expo ticket. `poll_push_receipts` resolves all `sent_to_expo` deliveries with ticket IDs and updates their parent jobs.

Queue processing failure is deliberately non-fatal to the originating user action. The job remains queued for retry. No recurring queue-worker or receipt-poller schedule is defined in the repository, so hosted scheduling must be verified before queued retries and receipts can be considered reliable.

The foreground notification handler requests banner, list, sound, and badge presentation on both platforms. Android's `default` channel now explicitly sets maximum importance, sound, and badge support. Notification response data is handled by `openNotificationTarget` and the shared navigation payload parser.

## Flow matrix

| Flow                     | Trigger / call site                                                                              | In-app row                                                                                                         | Job                                                   | Queue call                                        | Preference                     | Delivery           | Known risk                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- | ------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| Mention                  | `PostComposer`, `PollComposer`, and `InlineComments` call `triggerMentionPush` / `push_mentions` | Canonical `mention` row is created before preference filtering; client creation and Edge fallback dedupe by entity | `mention_post`, `mention_comment`, or `mention_reply` | Immediate per inserted job                        | `mentions`                     | Shared v2 delivery | Preference-off intentionally gives in-app without push; legacy row has no `notification_job_id`   |
| Reply / comment          | `InlineComments` calls `triggerCommentReplyPush` / `push_comment_replies` after insert           | Canonical `reply` row is created before preference filtering                                                       | `comment_on_post` or `reply_to_comment`               | Immediate per inserted job; failure leaves queued | `replies`                      | Shared v2 delivery | Preference-off intentionally gives in-app without push; legacy row has no `notification_job_id`   |
| Community post / poll    | `PostComposer` or `PollComposer` calls `push_community_posts`                                    | Job-insert trigger creates `community_post` / `community_poll` row with job ID                                     | One job per eligible member                           | Immediate in job-ID batches                       | `community_activity`           | Shared v2 delivery | Self, preference, daily-cap, and dedupe skips are intentional                                     |
| Fan activity status      | Registration status update calls `push_fan_activity_registration_status`                         | Job-insert trigger creates row with job ID                                                                         | Confirmed or payment-missing job                      | Immediate per inserted job; failure leaves queued | `community_activity`           | Shared v2 delivery | No in-app row when preference is disabled because filtering precedes enqueue                      |
| Match reminder           | Scheduled `push_match_reminders`                                                                 | Job-insert trigger creates row with job ID                                                                         | `match_checkin_reminder` per eligible attendee        | Immediate in job-ID batches                       | `matchday_checkin`             | Shared v2 delivery | Repository contains a schedule template, not proof of hosted activation                           |
| Event reminder           | Scheduled `push_event_reminders`                                                                 | Job-insert trigger creates row with job ID                                                                         | `event_reminder` per eligible attendee                | Immediate in job-ID batches                       | None (`preference_key = null`) | Shared v2 delivery | No user-facing event-reminder preference; hosted schedule must be verified                        |
| Hot post / media article | Scheduled `push_hot_posts`                                                                       | Job-insert trigger creates `hot_post` row with job ID                                                              | One job per selected recipient/post                   | Immediate in job-ID batches                       | None (`preference_key = null`) | Shared v2 delivery | No user-facing hot-post preference; hosted schedule must be verified                              |
| Match highfive           | `createMatchHighfive` calls `push_match_highfive` after the durable insert                       | Job-insert trigger creates row with job ID                                                                         | `match_highfive`                                      | Immediate per inserted job; failure is logged     | `highfives`                    | Shared v2 delivery | Push failure must not roll back the highfive                                                      |
| Media digest             | Scheduled `push_media_digest`                                                                    | Job-insert trigger creates row with job ID                                                                         | `media_digest` per active-device user                 | Immediate in job-ID batches                       | `media_digest`                 | Shared v2 delivery | Candidate recipients come from active devices, and the cron migration is marked manual activation |

## Concrete findings

- In-app-without-push is expected for mention/reply when the recipient disabled the relevant push preference. Those rows are intentionally created before preference filtering.
- Other v2 rows can exist without a visible system push when a job has no active device, was deduped from an earlier delivery, remains queued after processor failure, fails at Expo ticket/receipt time, or is suppressed by OS permissions/settings.
- Mention/reply notification-center rows are intentionally excluded from the job mirror trigger and therefore have `notification_job_id = null`. Linking optional/preference-disabled legacy rows to jobs needs a lifecycle decision; it was not papered over locally.
- Event reminders and hot posts pass no preference key even though the job constraint reserves `event_reminders` and `hot_posts`. Adding preferences needs schema/UI/product decisions.
- `claim_push_token` previously swallowed a failed v2 device write while returning success. It now surfaces that failure.
- Logout and permission revocation previously deleted only `push_tokens`; active `push_devices` could remain owned by the old user. The claim endpoint now supports authenticated revocation, and the app invokes it before clearing local state.
- `DeviceNotRegistered` invalidated `push_devices` but left the legacy status token behind. Ticket and receipt handling now remove the matching legacy token as well.
- Receipt polling selects every `sent_to_expo` delivery with a ticket, independent of notification type. Coverage is complete if and only if the hosted poller runs.

## Hosted read-only diagnostics

The local environment exposes only the public URL and anon key, not an authenticated admin read credential. Run the following read-only queries in the Supabase SQL editor. They return aggregates only.

```sql
-- Jobs by type and status, last 7 days.
select notification_type, status, count(*) as jobs
from public.notification_jobs
where created_at >= now() - interval '7 days'
group by notification_type, status
order by notification_type, status;

-- Deliveries by status, last 7 days.
select status, count(*) as deliveries
from public.notification_deliveries
where created_at >= now() - interval '7 days'
group by status
order by status;

-- Job skip/failure reasons, last 7 days.
select status, coalesce(skip_reason, last_error_code, 'none') as reason, count(*) as jobs
from public.notification_jobs
where created_at >= now() - interval '7 days'
  and status in ('skipped', 'failed', 'queued')
group by status, coalesce(skip_reason, last_error_code, 'none')
order by jobs desc;

-- Active and inactive v2 devices.
select case when invalidated_at is null then 'active' else 'inactive' end as device_state,
       count(*) as devices
from public.push_devices
group by device_state;

-- DeviceNotRegistered at ticket or receipt stage, last 7 days.
select count(*) as device_not_registered
from public.notification_deliveries
where created_at >= now() - interval '7 days'
  and expo_error_code = 'DeviceNotRegistered';

-- Jobs without any delivery, last 7 days.
select j.notification_type, j.status, coalesce(j.skip_reason, j.last_error_code, 'none') as reason,
       count(*) as jobs
from public.notification_jobs j
left join public.notification_deliveries d on d.job_id = j.id
where j.created_at >= now() - interval '7 days'
  and d.id is null
group by j.notification_type, j.status, coalesce(j.skip_reason, j.last_error_code, 'none')
order by jobs desc;

-- Notification-center rows without a job link, last 7 days.
select type, count(*) as notifications
from public.notifications
where created_at >= now() - interval '7 days'
  and notification_job_id is null
group by type
order by notifications desc;

-- Queued/processing jobs with no recent progress.
select status, notification_type, count(*) as jobs, min(updated_at) as oldest_update
from public.notification_jobs
where status in ('queued', 'processing')
  and updated_at < now() - interval '15 minutes'
group by status, notification_type
order by oldest_update;

-- Receipt failures, last 7 days.
select coalesce(expo_error_code, 'unknown') as error_code, count(*) as deliveries
from public.notification_deliveries
where created_at >= now() - interval '7 days'
  and expo_receipt_status = 'error'
group by coalesce(expo_error_code, 'unknown')
order by deliveries desc;
```
