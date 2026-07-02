// deno-lint-ignore-file no-explicit-any
import { createAdminClient, json, requireSyncSecret } from '../_shared/push.ts';

type ProcessPushQueuePayload = {
  limit?: unknown;
  jobId?: unknown;
  dryRun?: unknown;
};

type NotificationJob = {
  id: string;
  recipient_user_id: string;
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  created_at: string;
};

type PushDevice = {
  id: string;
  user_id: string;
  push_token: string;
  platform: 'ios' | 'android';
  last_seen_at: string | null;
};

type NotificationDelivery = {
  id: string;
  job_id: string;
  device_id: string | null;
  recipient_user_id: string;
  push_token_snapshot: string;
  platform: 'ios' | 'android';
  status: string;
  attempt_count: number;
  expo_ticket_id: string | null;
  expo_error_code: string | null;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

type JobProcessResult = {
  jobId: string;
  notificationType: string;
  status: 'sent_to_expo' | 'skipped' | 'queued' | 'failed';
  activeDevices: number;
  deliveriesCreated: number;
  sentToExpo: number;
  failed: number;
  skipped: number;
  reason?: string;
};

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const EXPO_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeLimit(value: unknown): number {
  const numericValue = typeof value === 'string' && value.trim().length > 0 ? Number(value) : value;

  if (typeof numericValue !== 'number' || !Number.isFinite(numericValue)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(numericValue)));
}

function readJobId(value: unknown): string | null {
  const normalized = readString(value);
  if (!normalized) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  )
    ? normalized
    : null;
}

async function readPayload(req: Request): Promise<ProcessPushQueuePayload> {
  try {
    return (await req.json()) as ProcessPushQueuePayload;
  } catch {
    return {};
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

function serializeError(error: unknown) {
  if (error && typeof error === 'object') {
    const maybeError = error as Record<string, unknown>;
    return {
      message:
        error instanceof Error
          ? error.message
          : (readString(maybeError.message) ?? readString(maybeError.error) ?? 'Unknown error'),
      code: readString(maybeError.code),
      details: readString(maybeError.details),
      hint: readString(maybeError.hint),
      status: typeof maybeError.status === 'number' ? maybeError.status : undefined,
    };
  }

  return {
    message: String(error ?? 'Unknown error'),
  };
}

function createWorkerId() {
  return `process_push_queue:${crypto.randomUUID()}`;
}

function getRetryAtIso(job: NotificationJob) {
  const delayMs = Math.min(15 * 60_000, Math.max(1, job.attempt_count) * 60_000);
  return new Date(Date.now() + delayMs).toISOString();
}

async function updateJob(supabase: any, jobId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('notification_jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

async function updateDelivery(supabase: any, deliveryId: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from('notification_deliveries')
    .update(patch)
    .eq('id', deliveryId);
  if (error) throw error;
}

async function invalidateDevice(
  supabase: any,
  deviceId: string | null,
  reason: 'device_not_registered' | 'invalid_push_token',
) {
  if (!deviceId) return;

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('push_devices')
    .update({
      invalidated_at: nowIso,
      invalidated_reason: reason,
      updated_at: nowIso,
    })
    .eq('id', deviceId)
    .is('invalidated_at', null);

  if (error) throw error;
}

async function sendExpoBatch(
  deliveries: NotificationDelivery[],
  job: NotificationJob,
): Promise<ExpoPushTicket[]> {
  const payload = deliveries.map((delivery) => ({
    to: delivery.push_token_snapshot,
    title: job.title,
    body: job.body,
    sound: 'default',
    channelId: 'default',
    data: job.data ?? {},
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`Expo push API failed with ${response.status}`);
      (error as Error & { status?: number; details?: string }).status = response.status;
      (error as Error & { status?: number; details?: string }).details = JSON.stringify(result);
      throw error;
    }

    return (Array.isArray(result?.data) ? result.data : []) as ExpoPushTicket[];
  } finally {
    clearTimeout(timeout);
  }
}

async function loadActiveDevices(supabase: any, userId: string): Promise<PushDevice[]> {
  const { data, error } = await supabase
    .from('push_devices')
    .select('id, user_id, push_token, platform, last_seen_at')
    .eq('user_id', userId)
    .is('invalidated_at', null)
    .order('last_seen_at', { ascending: false });

  if (error) throw error;
  return (data as PushDevice[] | null) ?? [];
}

async function upsertDeliveries(
  supabase: any,
  job: NotificationJob,
  devices: PushDevice[],
): Promise<number> {
  const rows = devices.map((device) => ({
    job_id: job.id,
    device_id: device.id,
    recipient_user_id: job.recipient_user_id,
    push_token_snapshot: device.push_token,
    platform: device.platform,
    status: 'queued',
  }));

  const { data, error } = await supabase
    .from('notification_deliveries')
    .upsert(rows, { onConflict: 'job_id,device_id', ignoreDuplicates: true })
    .select('id');

  if (error) throw error;
  return ((data as { id: string }[] | null) ?? []).length;
}

async function loadDeliveriesForJob(supabase: any, jobId: string): Promise<NotificationDelivery[]> {
  const { data, error } = await supabase
    .from('notification_deliveries')
    .select(
      'id, job_id, device_id, recipient_user_id, push_token_snapshot, platform, status, attempt_count, expo_ticket_id, expo_error_code',
    )
    .eq('job_id', jobId);

  if (error) throw error;
  return (data as NotificationDelivery[] | null) ?? [];
}

async function markDeliveryFailed(
  supabase: any,
  delivery: NotificationDelivery,
  params: {
    code: string;
    message: string;
    response?: Record<string, unknown> | ExpoPushTicket | null;
  },
) {
  await updateDelivery(supabase, delivery.id, {
    status: 'failed',
    attempt_count: delivery.attempt_count + 1,
    expo_ticket_status: 'error',
    expo_error_code: params.code,
    expo_error_message: params.message,
    expo_response: params.response ?? null,
    failed_at: new Date().toISOString(),
  });
}

async function processJob(supabase: any, job: NotificationJob): Promise<JobProcessResult> {
  const devices = await loadActiveDevices(supabase, job.recipient_user_id);

  if (devices.length === 0) {
    await updateJob(supabase, job.id, {
      status: 'skipped',
      skip_reason: 'no_active_device',
      locked_at: null,
      locked_by: null,
      last_error_code: null,
      last_error_message: null,
      last_error_details: null,
    });

    return {
      jobId: job.id,
      notificationType: job.notification_type,
      status: 'skipped',
      activeDevices: 0,
      deliveriesCreated: 0,
      sentToExpo: 0,
      failed: 0,
      skipped: 1,
      reason: 'no_active_device',
    };
  }

  const deliveriesCreated = await upsertDeliveries(supabase, job, devices);
  const activeDeviceIds = new Set(devices.map((device) => device.id));
  const deliveries = await loadDeliveriesForJob(supabase, job.id);
  const sendableDeliveries = deliveries.filter(
    (delivery) =>
      delivery.device_id &&
      activeDeviceIds.has(delivery.device_id) &&
      (delivery.status === 'queued' ||
        (delivery.status === 'failed' && delivery.expo_error_code === 'expo_request_failed')) &&
      !delivery.expo_ticket_id,
  );

  if (sendableDeliveries.length === 0) {
    const hasAlreadySent = deliveries.some(
      (delivery) => delivery.status === 'sent_to_expo' || delivery.status === 'delivered',
    );

    await updateJob(supabase, job.id, {
      status: hasAlreadySent ? 'sent_to_expo' : 'failed',
      locked_at: null,
      locked_by: null,
      last_error_code: hasAlreadySent ? null : 'no_sendable_deliveries',
      last_error_message: hasAlreadySent ? null : 'No queued deliveries were available to send',
    });

    return {
      jobId: job.id,
      notificationType: job.notification_type,
      status: hasAlreadySent ? 'sent_to_expo' : 'failed',
      activeDevices: devices.length,
      deliveriesCreated,
      sentToExpo: 0,
      failed: hasAlreadySent ? 0 : 1,
      skipped: 0,
      reason: hasAlreadySent ? 'already_sent_to_expo' : 'no_sendable_deliveries',
    };
  }

  let sentToExpo = 0;
  let failed = 0;
  let requestFailed = false;

  const validDeliveries: NotificationDelivery[] = [];
  for (const delivery of sendableDeliveries) {
    if (isExpoPushToken(delivery.push_token_snapshot)) {
      validDeliveries.push(delivery);
      continue;
    }

    failed += 1;
    await markDeliveryFailed(supabase, delivery, {
      code: 'invalid_push_token',
      message: 'Invalid Expo push token format',
    });
    await invalidateDevice(supabase, delivery.device_id, 'invalid_push_token');
  }

  for (const batch of chunk(validDeliveries, EXPO_BATCH_SIZE)) {
    let tickets: ExpoPushTicket[];

    try {
      tickets = await sendExpoBatch(batch, job);
    } catch (error) {
      requestFailed = true;
      const serialized = serializeError(error);
      failed += batch.length;

      for (const delivery of batch) {
        await markDeliveryFailed(supabase, delivery, {
          code: 'expo_request_failed',
          message: serialized.message,
          response: serialized as Record<string, unknown>,
        });
      }

      continue;
    }

    for (let index = 0; index < batch.length; index += 1) {
      const delivery = batch[index];
      const ticket = tickets[index];

      if (ticket?.status === 'ok') {
        sentToExpo += 1;
        await updateDelivery(supabase, delivery.id, {
          status: 'sent_to_expo',
          attempt_count: delivery.attempt_count + 1,
          expo_ticket_id: ticket.id ?? null,
          expo_ticket_status: 'ok',
          expo_error_code: null,
          expo_error_message: null,
          expo_response: ticket,
          sent_to_expo_at: new Date().toISOString(),
          failed_at: null,
        });
        continue;
      }

      failed += 1;
      const errorCode = ticket?.details?.error ?? 'expo_ticket_error';
      await markDeliveryFailed(supabase, delivery, {
        code: errorCode,
        message: ticket?.message ?? errorCode,
        response: ticket ?? { status: 'error', message: 'Missing Expo ticket' },
      });

      if (errorCode === 'DeviceNotRegistered') {
        await invalidateDevice(supabase, delivery.device_id, 'device_not_registered');
      }
    }
  }

  if (sentToExpo > 0) {
    await updateJob(supabase, job.id, {
      status: 'sent_to_expo',
      skip_reason: null,
      locked_at: null,
      locked_by: null,
      last_error_code: failed > 0 ? 'partial_delivery_failure' : null,
      last_error_message:
        failed > 0 ? `${failed} deliveries failed before Expo accepted them` : null,
      last_error_details: failed > 0 ? { failedDeliveries: failed } : null,
    });

    return {
      jobId: job.id,
      notificationType: job.notification_type,
      status: 'sent_to_expo',
      activeDevices: devices.length,
      deliveriesCreated,
      sentToExpo,
      failed,
      skipped: 0,
    };
  }

  const exhaustedAttempts = job.attempt_count >= job.max_attempts;
  const shouldRetry = requestFailed && !exhaustedAttempts;
  const status = shouldRetry ? 'queued' : 'failed';

  await updateJob(supabase, job.id, {
    status,
    locked_at: null,
    locked_by: null,
    next_attempt_at: shouldRetry ? getRetryAtIso(job) : job.next_attempt_at,
    last_error_code: requestFailed ? 'expo_request_failed' : 'all_deliveries_failed',
    last_error_message: requestFailed
      ? 'Expo request failed; job will retry if attempts remain'
      : 'All deliveries failed before Expo accepted the notification',
    last_error_details: { failedDeliveries: failed },
  });

  return {
    jobId: job.id,
    notificationType: job.notification_type,
    status,
    activeDevices: devices.length,
    deliveriesCreated,
    sentToExpo,
    failed,
    skipped: 0,
    reason: requestFailed ? 'expo_request_failed' : 'all_deliveries_failed',
  };
}

async function dryRunQueuedJobs(
  supabase: any,
  {
    limit,
    jobId,
  }: {
    limit: number;
    jobId: string | null;
  },
) {
  let query = supabase
    .from('notification_jobs')
    .select(
      'id, recipient_user_id, notification_type, title, status, attempt_count, max_attempts, next_attempt_at, created_at',
    )
    .eq('status', 'queued')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  if (jobId) {
    query = query.eq('id', jobId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const jobs = ((data as NotificationJob[] | null) ?? []).filter(
    (job) => job.attempt_count < job.max_attempts,
  );

  const rows = [];
  for (const job of jobs) {
    const devices = await loadActiveDevices(supabase, job.recipient_user_id);
    rows.push({
      jobId: job.id,
      notificationType: job.notification_type,
      recipientUserId: job.recipient_user_id,
      activeDevices: devices.length,
      attemptCount: job.attempt_count,
      maxAttempts: job.max_attempts,
      nextAttemptAt: job.next_attempt_at,
    });
  }

  return rows;
}

Deno.serve(async (req) => {
  try {
    const syncSecretError = requireSyncSecret(req);
    if (syncSecretError) {
      return syncSecretError;
    }

    const payload = await readPayload(req);
    const limit = normalizeLimit(payload.limit);
    const rawJobId = readString(payload.jobId);
    const jobId = rawJobId ? readJobId(rawJobId) : null;
    const dryRun = readBoolean(payload.dryRun);
    const supabase = createAdminClient();

    if (rawJobId && !jobId) {
      return json(400, {
        ok: false,
        error: { message: 'Invalid jobId' },
      });
    }

    if (dryRun) {
      const jobs = await dryRunQueuedJobs(supabase, { limit, jobId });
      return json(200, {
        ok: true,
        dryRun: true,
        limit,
        jobId,
        matched: jobs.length,
        jobs,
      });
    }

    const workerId = createWorkerId();
    const { data, error } = await supabase.rpc('claim_notification_jobs', {
      p_limit: limit,
      p_worker_id: workerId,
      p_job_id: jobId,
    });

    if (error) throw error;

    const jobs = (data as NotificationJob[] | null) ?? [];
    const results: JobProcessResult[] = [];

    for (const job of jobs) {
      try {
        results.push(await processJob(supabase, job));
      } catch (error) {
        const serialized = serializeError(error);
        await updateJob(supabase, job.id, {
          status: job.attempt_count >= job.max_attempts ? 'failed' : 'queued',
          locked_at: null,
          locked_by: null,
          next_attempt_at:
            job.attempt_count >= job.max_attempts ? job.next_attempt_at : getRetryAtIso(job),
          last_error_code: serialized.code ?? 'process_job_failed',
          last_error_message: serialized.message,
          last_error_details: serialized,
        });

        results.push({
          jobId: job.id,
          notificationType: job.notification_type,
          status: job.attempt_count >= job.max_attempts ? 'failed' : 'queued',
          activeDevices: 0,
          deliveriesCreated: 0,
          sentToExpo: 0,
          failed: 1,
          skipped: 0,
          reason: serialized.message,
        });
      }
    }

    const totals = results.reduce(
      (acc, result) => ({
        activeDevices: acc.activeDevices + result.activeDevices,
        deliveriesCreated: acc.deliveriesCreated + result.deliveriesCreated,
        sentToExpo: acc.sentToExpo + result.sentToExpo,
        failed: acc.failed + result.failed,
        skipped: acc.skipped + result.skipped,
      }),
      { activeDevices: 0, deliveriesCreated: 0, sentToExpo: 0, failed: 0, skipped: 0 },
    );

    return json(200, {
      ok: true,
      dryRun: false,
      workerId,
      limit,
      jobId,
      claimed: jobs.length,
      totals,
      jobs: results,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: serializeError(error),
    });
  }
});
