// deno-lint-ignore-file no-explicit-any
import { createAdminClient, json, requireSyncSecret } from '../_shared/push.ts';

type PollPushReceiptsPayload = {
  deliveryId?: unknown;
  jobId?: unknown;
  limit?: unknown;
};

type NotificationDelivery = {
  id: string;
  job_id: string;
  device_id: string | null;
  status: string;
  push_token_snapshot: string;
  expo_ticket_id: string;
  receipt_checked_at: string | null;
  created_at: string;
  sent_to_expo_at: string | null;
};

type DeliveryForJobStatus = {
  job_id: string;
  status: string;
  expo_error_code: string | null;
  expo_error_message: string | null;
};

type ExpoPushReceipt = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

type DeliveryPollResult = {
  deliveryId: string;
  jobId: string;
  ticketId: string;
  status: 'delivered' | 'failed' | 'pending';
  errorCode?: string;
  deviceInvalidated?: boolean;
};

const EXPO_RECEIPTS_API_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_BATCH_SIZE = 100;
const EXPO_REQUEST_TIMEOUT_MS = 10_000;
const RECEIPT_RETRY_WINDOW_MS = 15 * 60_000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 25;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeLimit(value: unknown): number {
  const numericValue = typeof value === 'string' && value.trim().length > 0 ? Number(value) : value;

  if (typeof numericValue !== 'number' || !Number.isFinite(numericValue)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(numericValue)));
}

function readUuid(value: unknown): string | null {
  const normalized = readString(value);
  if (!normalized) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  )
    ? normalized
    : null;
}

async function readPayload(req: Request): Promise<PollPushReceiptsPayload> {
  try {
    return (await req.json()) as PollPushReceiptsPayload;
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

async function updateDelivery(supabase: any, deliveryId: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from('notification_deliveries')
    .update(patch)
    .eq('id', deliveryId);
  if (error) throw error;
}

async function updateJob(supabase: any, jobId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('notification_jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

async function invalidateDevice(supabase: any, deviceId: string | null, pushToken: string) {
  if (deviceId) {
    const { error } = await supabase
      .from('push_devices')
      .update({
        invalidated_at: new Date().toISOString(),
        invalidated_reason: 'device_not_registered',
      })
      .eq('id', deviceId)
      .is('invalidated_at', null);

    if (error) throw error;
  }

  const { error: legacyError } = await supabase
    .from('push_tokens')
    .delete()
    .eq('push_token', pushToken);
  if (legacyError) {
    console.warn('[poll_push_receipts] legacy token cleanup failed', {
      deviceId,
      error: String(legacyError),
    });
  }
  return true;
}

async function fetchExpoReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(EXPO_RECEIPTS_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: ticketIds }),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`Expo receipts API failed with ${response.status}`);
      (error as Error & { status?: number; details?: string }).status = response.status;
      (error as Error & { status?: number; details?: string }).details = JSON.stringify(result);
      throw error;
    }

    return (result?.data ?? {}) as Record<string, ExpoPushReceipt>;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCandidateDeliveries(
  supabase: any,
  {
    deliveryId,
    jobId,
    limit,
  }: {
    deliveryId: string | null;
    jobId: string | null;
    limit: number;
  },
): Promise<NotificationDelivery[]> {
  const retryBeforeIso = new Date(Date.now() - RECEIPT_RETRY_WINDOW_MS).toISOString();
  let query = supabase
    .from('notification_deliveries')
    .select(
      'id, job_id, device_id, status, push_token_snapshot, expo_ticket_id, receipt_checked_at, created_at, sent_to_expo_at',
    )
    .eq('status', 'sent_to_expo')
    .not('expo_ticket_id', 'is', null)
    .or(`receipt_checked_at.is.null,receipt_checked_at.lte.${retryBeforeIso}`)
    .order('sent_to_expo_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (deliveryId) {
    query = query.eq('id', deliveryId);
  }

  if (jobId) {
    query = query.eq('job_id', jobId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as NotificationDelivery[] | null) ?? [];
}

async function handleReceipt(
  supabase: any,
  delivery: NotificationDelivery,
  receipt: ExpoPushReceipt | undefined,
): Promise<DeliveryPollResult> {
  const nowIso = new Date().toISOString();

  if (!receipt) {
    await updateDelivery(supabase, delivery.id, {
      receipt_checked_at: nowIso,
    });

    return {
      deliveryId: delivery.id,
      jobId: delivery.job_id,
      ticketId: delivery.expo_ticket_id,
      status: 'pending',
    };
  }

  if (receipt.status === 'ok') {
    await updateDelivery(supabase, delivery.id, {
      status: 'delivered',
      expo_receipt_status: 'ok',
      receipt_checked_at: nowIso,
      delivered_at: nowIso,
      failed_at: null,
    });

    return {
      deliveryId: delivery.id,
      jobId: delivery.job_id,
      ticketId: delivery.expo_ticket_id,
      status: 'delivered',
    };
  }

  const errorCode = receipt.details?.error ?? 'expo_receipt_error';
  const deviceInvalidated =
    errorCode === 'DeviceNotRegistered'
      ? await invalidateDevice(supabase, delivery.device_id, delivery.push_token_snapshot)
      : false;

  await updateDelivery(supabase, delivery.id, {
    status: 'failed',
    expo_receipt_status: 'error',
    expo_error_code: errorCode,
    expo_error_message: receipt.message ?? errorCode,
    expo_response: receipt,
    receipt_checked_at: nowIso,
    failed_at: nowIso,
  });

  return {
    deliveryId: delivery.id,
    jobId: delivery.job_id,
    ticketId: delivery.expo_ticket_id,
    status: 'failed',
    errorCode,
    deviceInvalidated,
  };
}

async function updateParentJobs(supabase: any, jobIds: string[]) {
  const uniqueJobIds = Array.from(new Set(jobIds));
  if (uniqueJobIds.length === 0) return [];

  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('job_id, status, expo_error_code, expo_error_message')
    .in('job_id', uniqueJobIds);

  if (error) throw error;

  const deliveries = (data as DeliveryForJobStatus[] | null) ?? [];
  const deliveriesByJobId = new Map<string, DeliveryForJobStatus[]>();

  for (const delivery of deliveries) {
    const list = deliveriesByJobId.get(delivery.job_id) ?? [];
    list.push(delivery);
    deliveriesByJobId.set(delivery.job_id, list);
  }

  const updates = [];
  for (const jobId of uniqueJobIds) {
    const jobDeliveries = deliveriesByJobId.get(jobId) ?? [];
    if (jobDeliveries.length === 0) continue;

    const hasDelivered = jobDeliveries.some((delivery) => delivery.status === 'delivered');
    const allFailed = jobDeliveries.every((delivery) => delivery.status === 'failed');
    const nextStatus = hasDelivered ? 'delivered' : allFailed ? 'failed' : 'sent_to_expo';

    const firstFailedDelivery = jobDeliveries.find((delivery) => delivery.status === 'failed');
    await updateJob(supabase, jobId, {
      status: nextStatus,
      last_error_code:
        nextStatus === 'failed'
          ? (firstFailedDelivery?.expo_error_code ?? 'all_deliveries_failed')
          : null,
      last_error_message:
        nextStatus === 'failed'
          ? (firstFailedDelivery?.expo_error_message ?? 'All deliveries failed')
          : null,
      last_error_details:
        nextStatus === 'failed'
          ? {
              failedDeliveries: jobDeliveries.length,
            }
          : null,
    });

    updates.push({
      jobId,
      status: nextStatus,
      deliveryCount: jobDeliveries.length,
    });
  }

  return updates;
}

Deno.serve(async (req) => {
  try {
    const syncSecretError = requireSyncSecret(req);
    if (syncSecretError) {
      return syncSecretError;
    }

    const payload = await readPayload(req);
    const rawDeliveryId = readString(payload.deliveryId);
    const deliveryId = rawDeliveryId ? readUuid(rawDeliveryId) : null;
    const rawJobId = readString(payload.jobId);
    const jobId = rawJobId ? readUuid(rawJobId) : null;
    const limit = normalizeLimit(payload.limit);

    if (rawDeliveryId && !deliveryId) {
      return json(400, {
        ok: false,
        error: { message: 'Invalid deliveryId' },
      });
    }

    if (rawJobId && !jobId) {
      return json(400, {
        ok: false,
        error: { message: 'Invalid jobId' },
      });
    }

    const supabase = createAdminClient();
    const deliveries = await loadCandidateDeliveries(supabase, { deliveryId, jobId, limit });
    const results: DeliveryPollResult[] = [];

    for (const batch of chunk(deliveries, EXPO_BATCH_SIZE)) {
      const receiptByTicketId = await fetchExpoReceipts(
        batch.map((delivery) => delivery.expo_ticket_id),
      );

      for (const delivery of batch) {
        results.push(
          await handleReceipt(supabase, delivery, receiptByTicketId[delivery.expo_ticket_id]),
        );
      }
    }

    const jobsUpdated = await updateParentJobs(
      supabase,
      results.map((result) => result.jobId),
    );

    return json(200, {
      ok: true,
      limit,
      deliveryId,
      jobId,
      checked: results.length,
      delivered: results.filter((result) => result.status === 'delivered').length,
      failed: results.filter((result) => result.status === 'failed').length,
      pending: results.filter((result) => result.status === 'pending').length,
      deviceInvalidated: results.filter((result) => result.deviceInvalidated).length,
      jobsUpdated,
      results,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: serializeError(error),
    });
  }
});
