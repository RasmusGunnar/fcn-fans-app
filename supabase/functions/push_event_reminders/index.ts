// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  json,
  requireSyncSecret,
} from '../_shared/push.ts';

const LEAD_MINUTES = 180;
const WINDOW_MINUTES = 15;
const QUEUE_BATCH_SIZE = 25;

type EnqueueNotificationResult = {
  job_id: string;
  inserted: boolean;
  job_status: string;
  skip_reason: string | null;
};

type ProcessPushQueueResult = {
  ok?: boolean;
  requested?: number;
  claimed?: number;
  sent?: number;
  delivered?: number;
  skipped?: number;
  failed?: number;
  notClaimable?: number;
  requestedJobIds?: string[];
  claimedJobIds?: string[];
  notClaimableJobIds?: string[];
  totals?: {
    deliveriesCreated?: number;
    sentToExpo?: number;
    failed?: number;
    skipped?: number;
  };
  jobs?: {
    jobId?: string;
    status?: string;
    activeDevices?: number;
    deliveriesCreated?: number;
    sentToExpo?: number;
    failed?: number;
    skipped?: number;
    reason?: string;
  }[];
  error?: unknown;
};

type EventReminderJobResult = {
  recipientUserId: string;
  jobId: string | null;
  inserted: boolean;
  skippedReason: 'duplicate' | 'enqueue_failed' | null;
  process?: ProcessPushQueueResult | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatTimeDa(iso: string): string {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen',
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function enqueueEventReminderJob(params: {
  supabase: any;
  recipientUserId: string;
  eventId: string;
  title: string;
  body: string;
  dedupeKey: string;
  data: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .rpc('enqueue_notification', {
      p_recipient_user_id: params.recipientUserId,
      p_notification_type: 'event_reminder',
      p_title: params.title,
      p_body: params.body,
      p_dedupe_key: params.dedupeKey,
      p_data: params.data,
      p_actor_user_id: null,
      p_preference_key: null,
      p_source_table: 'events',
      p_source_id: params.eventId,
      p_next_attempt_at: new Date().toISOString(),
      p_max_attempts: 5,
    })
    .single();

  if (error) throw error;
  return data as EnqueueNotificationResult;
}

async function processQueuedJobs(jobIds: string[]): Promise<ProcessPushQueueResult> {
  const url = readString(Deno.env.get('SUPABASE_URL'));
  const syncSecret = readString(Deno.env.get('SYNC_SECRET'));

  if (!url || !syncSecret) {
    throw new Error('Missing SUPABASE_URL or SYNC_SECRET');
  }

  const response = await fetch(`${url}/functions/v1/process_push_queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': syncSecret,
    },
    body: JSON.stringify({ jobIds, limit: QUEUE_BATCH_SIZE }),
  });

  const result = (await response.json().catch(() => null)) as ProcessPushQueueResult | null;
  if (!response.ok || !result?.ok) {
    throw new Error(
      `process_push_queue failed with ${response.status}: ${JSON.stringify(result ?? {})}`,
    );
  }

  return result;
}

function getProcessCounts(results: EventReminderJobResult[]) {
  const processResults = Array.from(
    new Set(
      results
        .map((result) => result.process)
        .filter((result): result is ProcessPushQueueResult => Boolean(result)),
    ),
  );
  const processTotals = processResults.reduce(
    (acc, result) => ({
      deliveriesCreated: acc.deliveriesCreated + (result.totals?.deliveriesCreated ?? 0),
      sentToExpo: acc.sentToExpo + (result.totals?.sentToExpo ?? 0),
      failed: acc.failed + (result.totals?.failed ?? 0),
      skipped: acc.skipped + (result.totals?.skipped ?? 0),
    }),
    { deliveriesCreated: 0, sentToExpo: 0, failed: 0, skipped: 0 },
  );
  const processedJobIds = new Set(
    processResults.flatMap((result) => result.jobs?.map((job) => job.jobId).filter(Boolean) ?? []),
  );
  const notClaimableJobIds = new Set(
    processResults.flatMap((result) => result.notClaimableJobIds ?? []),
  );
  const insertedJobs = results.filter((result) => result.inserted && result.jobId);
  const unprocessedQueued = insertedJobs.filter(
    (result) =>
      result.jobId && !processedJobIds.has(result.jobId) && !notClaimableJobIds.has(result.jobId),
  ).length;
  const duplicateJobs = results.filter((result) => result.skippedReason === 'duplicate').length;
  const enqueueFailures = results.filter(
    (result) => result.skippedReason === 'enqueue_failed',
  ).length;

  return {
    total: insertedJobs.length,
    queued: processTotals.deliveriesCreated + unprocessedQueued,
    skipped: duplicateJobs + processTotals.skipped,
    sent: processTotals.sentToExpo,
    failed: enqueueFailures + processTotals.failed,
  };
}

Deno.serve(async (req) => {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() + (LEAD_MINUTES - WINDOW_MINUTES) * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LEAD_MINUTES * 60 * 1000);

    const { data: events, error: eventError } = await supabase
      .from('events')
      .select('id, title, start_at')
      .gt('start_at', windowStart.toISOString())
      .lte('start_at', windowEnd.toISOString())
      .order('start_at', { ascending: true });

    if (eventError) {
      throw eventError;
    }

    const jobs: EventReminderJobResult[] = [];
    const processResults: ProcessPushQueueResult[] = [];
    const processFailures: { jobIds: string[]; error: string }[] = [];

    for (const event of events ?? []) {
      const { data: rsvps, error: rsvpError } = await supabase
        .from('rsvps')
        .select('user_id')
        .eq('entity_type', 'event')
        .eq('entity_id', event.id)
        .eq('status', 'going');

      if (rsvpError) {
        throw rsvpError;
      }

      const rsvpUserIds = Array.from(
        new Set(
          (rsvps ?? [])
            .map((row: any) => row.user_id as string | null)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      if (rsvpUserIds.length === 0) {
        continue;
      }

      for (const userId of rsvpUserIds) {
        const eventId = String(event.id);
        const dedupeKey = buildNotificationDedupeKey('event_reminder', eventId, userId);
        try {
          const enqueueResult = await enqueueEventReminderJob({
            supabase,
            recipientUserId: userId,
            eventId,
            title: 'Event starter snart 🎉',
            body: `${event.title} starter kl. ${formatTimeDa(String(event.start_at))}`,
            data: {
              type: 'event',
              eventId,
              url: `fcnfans://event/${event.id}`,
            },
            dedupeKey,
          });

          jobs.push({
            recipientUserId: userId,
            jobId: enqueueResult.job_id,
            inserted: enqueueResult.inserted,
            skippedReason: enqueueResult.inserted ? null : 'duplicate',
          });
        } catch (error) {
          console.warn('[push_event_reminders] enqueue failed', {
            eventId,
            recipientUserId: userId,
            error: String(error),
          });
          jobs.push({
            recipientUserId: userId,
            jobId: null,
            inserted: false,
            skippedReason: 'enqueue_failed',
          });
        }
      }
    }

    const insertedJobIds = jobs
      .filter((job): job is EventReminderJobResult & { jobId: string } =>
        Boolean(job.inserted && job.jobId),
      )
      .map((job) => job.jobId);

    if (insertedJobIds.length > 0) {
      const jobsById = new Map(
        jobs
          .filter((job): job is EventReminderJobResult & { jobId: string } => Boolean(job.jobId))
          .map((job) => [job.jobId, job]),
      );

      for (const jobIdChunk of chunk(insertedJobIds, QUEUE_BATCH_SIZE)) {
        try {
          const processResult = await processQueuedJobs(jobIdChunk);
          processResults.push(processResult);

          for (const processedJob of processResult.jobs ?? []) {
            const job = processedJob.jobId ? jobsById.get(processedJob.jobId) : null;
            if (job) {
              job.process = processResult;
            }
          }

          for (const notClaimableJobId of processResult.notClaimableJobIds ?? []) {
            const job = jobsById.get(notClaimableJobId);
            if (job) {
              job.process = processResult;
            }
          }
        } catch (error) {
          processFailures.push({
            jobIds: jobIdChunk,
            error: String(error),
          });
          console.warn('[push_event_reminders] process_push_queue chunk failed after enqueue', {
            jobIds: jobIdChunk,
            error: String(error),
          });
        }
      }
    }

    const result = getProcessCounts(jobs);
    return json(200, {
      ok: true,
      engine: 'v2',
      eventsMatched: (events ?? []).length,
      jobsInserted: insertedJobIds.length,
      queueProcessChunks: processResults.length,
      queueProcessFailures: processFailures.length,
      processFailures,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
