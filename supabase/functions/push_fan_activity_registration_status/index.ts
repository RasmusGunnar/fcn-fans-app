// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  fetchPushPreferencesByUserIds,
  isPushPreferenceEnabled,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type RegistrationStatus = 'pending_payment' | 'pending_verification' | 'confirmed';

type Payload = {
  registrationId?: string;
  status?: RegistrationStatus;
};

type RegistrationRow = {
  id: string;
  status: RegistrationStatus;
  user_id: string;
  fan_activity_id: string;
  fan_activities?: {
    id: string;
    title: string | null;
    parent_type: string | null;
    parent_id: string | null;
  } | null;
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

async function readRequestBody(req: Request): Promise<Payload> {
  try {
    const raw = await req.text();
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Payload;
  } catch {
    return {};
  }
}

function getNotificationCopy(status: RegistrationStatus, activityTitle: string) {
  if (status === 'confirmed') {
    return {
      title: 'Plads bekræftet',
      body: `Din plads til ${activityTitle} er bekræftet.`,
      notificationType: 'fan_activity_registration_confirmed',
    };
  }

  return {
    title: 'Betaling mangler',
    body: `Din tilmelding til ${activityTitle} er ikke endeligt bekræftet endnu.`,
    notificationType: 'fan_activity_registration_payment_missing',
  };
}

function buildFanActivityNotificationData(
  row: RegistrationRow,
  registrationId: string,
  notificationType: string,
) {
  const fanActivityId = readString(row.fan_activity_id);
  const parentType = readString(row.fan_activities?.parent_type ?? null);
  const parentId = readString(row.fan_activities?.parent_id ?? null);
  const baseData = {
    notificationType,
    registrationId,
    fanActivityId: fanActivityId ?? row.fan_activity_id,
  };

  if (fanActivityId && parentId && parentType === 'match') {
    return {
      ...baseData,
      targetType: 'match',
      type: 'match',
      fixtureId: parentId,
      url: `fcnfans://match/${encodeURIComponent(parentId)}/fan-activity/${encodeURIComponent(
        fanActivityId,
      )}`,
    };
  }

  if (fanActivityId && parentId && parentType === 'event') {
    return {
      ...baseData,
      targetType: 'event',
      type: 'event',
      eventId: parentId,
      url: `fcnfans://event/${encodeURIComponent(parentId)}/fan-activity/${encodeURIComponent(
        fanActivityId,
      )}`,
    };
  }

  return {
    ...baseData,
    targetType: 'home_feed',
    type: 'home_feed',
  };
}

async function enqueueRegistrationStatusJob(params: {
  supabase: any;
  recipientUserId: string;
  actorUserId: string;
  notificationType: string;
  title: string;
  body: string;
  dedupeKey: string;
  data: Record<string, unknown>;
  registrationId: string;
}) {
  const { data, error } = await params.supabase
    .rpc('enqueue_notification', {
      p_recipient_user_id: params.recipientUserId,
      p_notification_type: params.notificationType,
      p_title: params.title,
      p_body: params.body,
      p_dedupe_key: params.dedupeKey,
      p_data: params.data,
      p_actor_user_id: params.actorUserId,
      p_preference_key: 'community_activity',
      p_source_table: 'fan_activity_registrations',
      p_source_id: params.registrationId,
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

function getProcessCounts(result: ProcessPushQueueResult | null) {
  const totals = result?.totals ?? {};
  const firstJob = Array.isArray(result?.jobs) ? result?.jobs[0] : null;

  return {
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
    const body = await readRequestBody(req);
    const registrationId = readString(body.registrationId);
    const status = readString(body.status) as RegistrationStatus | null;

    if (!registrationId || !status) {
      return json(400, { error: 'Missing registrationId or status' });
    }

    if (status !== 'confirmed' && status !== 'pending_payment') {
      return json(200, { ok: true, skipped: 'unsupported_status' });
    }

    const supabase = createAdminClient();
    const { data: registration, error: registrationError } = await supabase
      .from('fan_activity_registrations')
      .select(
        'id, status, user_id, fan_activity_id, fan_activities(id, title, parent_type, parent_id)',
      )
      .eq('id', registrationId)
      .maybeSingle();

    if (registrationError) {
      throw registrationError;
    }

    const row = (registration as RegistrationRow | null) ?? null;
    if (!row?.id) {
      return json(404, { error: 'Registration not found' });
    }

    const canManage = await supabase.rpc('can_manage_fan_activity_registrations', {
      p_fan_activity_id: row.fan_activity_id,
      p_user_id: callerUserId,
    });

    if (canManage.error) {
      throw canManage.error;
    }

    if (canManage.data !== true) {
      return json(403, { error: 'Not allowed to manage this registration' });
    }

    if (row.status !== status) {
      return json(200, { ok: true, skipped: 'status_mismatch' });
    }

    const targetUserId = readString(row.user_id);
    if (!targetUserId) {
      return json(200, { ok: true, skipped: 'missing_user' });
    }

    const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, [targetUserId]);
    if (!isPushPreferenceEnabled(preferencesByUserId, targetUserId, 'community_activity')) {
      return json(200, { ok: true, skipped: 'preferences_disabled' });
    }

    const activityTitle = readString(row.fan_activities?.title) ?? 'fanaktiviteten';
    const copy = getNotificationCopy(status, activityTitle);
    const dedupeKey = buildNotificationDedupeKey(
      copy.notificationType,
      registrationId,
      targetUserId,
    );

    const enqueueResult = await enqueueRegistrationStatusJob({
      supabase,
      recipientUserId: targetUserId,
      actorUserId: callerUserId,
      notificationType: copy.notificationType,
      title: copy.title,
      body: copy.body,
      dedupeKey,
      data: buildFanActivityNotificationData(row, registrationId, copy.notificationType),
      registrationId,
    });

    if (!enqueueResult.inserted) {
      return json(200, {
        ok: true,
        engine: 'v2',
        skipped: 'duplicate',
        total: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        jobId: enqueueResult.job_id,
        jobStatus: enqueueResult.job_status,
        inserted: false,
      });
    }

    let processResult: ProcessPushQueueResult | null = null;
    try {
      processResult = await processQueuedJob(enqueueResult.job_id);
    } catch (error) {
      console.warn(
        '[push_fan_activity_registration_status] process_push_queue failed after enqueue',
        {
          registrationId,
          jobId: enqueueResult.job_id,
          error: String(error),
        },
      );
    }

    const counts = getProcessCounts(processResult);
    return json(200, {
      ok: true,
      engine: 'v2',
      total: 1,
      queued: processResult ? counts.queued : 1,
      skipped: counts.skipped,
      sent: counts.sent,
      failed: counts.failed,
      jobId: enqueueResult.job_id,
      jobStatus: counts.jobStatus ?? enqueueResult.job_status ?? 'queued',
      inserted: true,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
