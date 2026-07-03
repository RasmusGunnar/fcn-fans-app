// deno-lint-ignore-file no-explicit-any
import { createAdminClient, json, requireAuthenticatedUser } from '../_shared/push.ts';

type Payload = {
  toUserId?: string;
  pushToken?: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  notificationType?: string;
  dedupeKey?: string;
};

type PushDevice = {
  id: string;
  user_id: string;
  push_token: string;
  platform: 'ios' | 'android';
  last_seen_at: string | null;
};

type EnqueueNotificationResult = {
  job_id: string;
  inserted: boolean;
  job_status: string;
  skip_reason: string | null;
};

type ProcessPushQueueResult = {
  ok?: boolean;
  claimed?: number;
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function fetchActivePushDevices(supabase: any, userId: string): Promise<PushDevice[]> {
  const { data, error } = await supabase
    .from('push_devices')
    .select('id, user_id, push_token, platform, last_seen_at')
    .eq('user_id', userId)
    .is('invalidated_at', null)
    .order('last_seen_at', { ascending: false });

  if (error) throw error;
  return (data as PushDevice[] | null) ?? [];
}

function selectTargetDevices(devices: PushDevice[], pushToken: string | null) {
  if (!pushToken) {
    return {
      matchedRequestedToken: true,
      targetDevices: devices,
      targetDeviceId: null,
    };
  }

  const matchedDevice = devices.find((device) => device.push_token === pushToken) ?? null;
  if (matchedDevice) {
    return {
      matchedRequestedToken: true,
      targetDevices: [matchedDevice],
      targetDeviceId: matchedDevice.id,
    };
  }

  return {
    matchedRequestedToken: false,
    targetDevices: devices,
    targetDeviceId: null,
  };
}

function buildJobData(data: Record<string, any> | undefined, targetDeviceId: string | null) {
  const baseData = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const { __v2, ...publicData } = baseData;

  if (!targetDeviceId) {
    return publicData;
  }

  return {
    ...publicData,
    __v2: {
      targetDeviceId,
    },
  };
}

function getDefaultDedupeKey(params: {
  userId: string;
  targetDevices: PushDevice[];
  title: string;
  body: string;
}) {
  const devicePart = params.targetDevices
    .map((device) => device.id)
    .sort()
    .join(',');

  return `manual_test:${params.userId}:${devicePart}:${params.title}:${params.body}:${Date.now()}`;
}

async function enqueueManualTestJob(params: {
  supabase: any;
  userId: string;
  title: string;
  body: string;
  dedupeKey: string;
  data: Record<string, any>;
}) {
  const { data, error } = await params.supabase
    .rpc('enqueue_notification', {
      p_recipient_user_id: params.userId,
      p_notification_type: 'manual_test',
      p_title: params.title,
      p_body: params.body,
      p_dedupe_key: params.dedupeKey,
      p_data: params.data,
      p_actor_user_id: params.userId,
      p_preference_key: null,
      p_source_table: 'manual_send_push',
      p_source_id: null,
      p_next_attempt_at: new Date().toISOString(),
      p_max_attempts: 5,
    })
    .single();

  if (error) throw error;
  return data as EnqueueNotificationResult;
}

async function processQueuedJob(jobId: string): Promise<ProcessPushQueueResult> {
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
    body: JSON.stringify({ jobId, limit: 1 }),
  });

  const result = (await response.json().catch(() => null)) as ProcessPushQueueResult | null;
  if (!response.ok || !result?.ok) {
    throw new Error(
      `process_push_queue failed with ${response.status}: ${JSON.stringify(result ?? {})}`,
    );
  }

  return result;
}

function getProcessCounts(result: ProcessPushQueueResult, targetDeviceCount: number) {
  const totals = result.totals ?? {};
  const firstJob = Array.isArray(result.jobs) ? result.jobs[0] : null;

  return {
    total: targetDeviceCount,
    queued:
      typeof totals.deliveriesCreated === 'number'
        ? totals.deliveriesCreated
        : (firstJob?.deliveriesCreated ?? 0),
    skipped: typeof totals.skipped === 'number' ? totals.skipped : (firstJob?.skipped ?? 0),
    sent: typeof totals.sentToExpo === 'number' ? totals.sentToExpo : (firstJob?.sentToExpo ?? 0),
    failed: typeof totals.failed === 'number' ? totals.failed : (firstJob?.failed ?? 0),
    jobStatus: readString(firstJob?.status) ?? null,
  };
}

Deno.serve(async (req) => {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.response) {
      return auth.response;
    }

    const callerUserId = auth.user.id as string;
    const payload: Payload = await req.json();
    const targetUserId = payload?.toUserId ?? callerUserId;
    const title = payload?.title?.trim() ?? '';
    const body = payload?.body?.trim() ?? '';

    if (targetUserId !== callerUserId) {
      return json(403, { error: 'send-push only supports self-test for the authenticated user' });
    }

    if (!title || !body) {
      return json(400, { error: 'missing title or body' });
    }

    const supabase = createAdminClient();
    const pushToken = payload.pushToken?.trim() || null;
    const activeDevices = await fetchActivePushDevices(supabase, callerUserId);
    const { matchedRequestedToken, targetDevices, targetDeviceId } = selectTargetDevices(
      activeDevices,
      pushToken,
    );

    if (targetDevices.length === 0) {
      return json(200, { ok: true, skipped: 'no token' });
    }

    const dedupeKey =
      readString(payload.dedupeKey) ??
      getDefaultDedupeKey({
        userId: callerUserId,
        targetDevices,
        title,
        body,
      });

    const jobData = buildJobData(payload.data, targetDeviceId);
    const enqueueResult = await enqueueManualTestJob({
      supabase,
      userId: callerUserId,
      title,
      body,
      dedupeKey,
      data: jobData,
    });

    const processResult = await processQueuedJob(enqueueResult.job_id);
    const counts = getProcessCounts(processResult, targetDevices.length);

    return json(200, {
      ok: true,
      matchedRequestedToken,
      requestedPushToken: pushToken,
      total: counts.total,
      queued: counts.queued,
      skipped: counts.skipped,
      sent: counts.sent,
      failed: counts.failed,
      engine: 'v2',
      jobId: enqueueResult.job_id,
      jobStatus: counts.jobStatus ?? enqueueResult.job_status,
      inserted: enqueueResult.inserted,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
