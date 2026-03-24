// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export type DispatchNotificationRequest = {
  userId: string;
  pushToken: string;
  notificationType: string;
  dedupeKey: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ReservedNotification = DispatchNotificationRequest & {
  logId: string;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const ACTIVE_NOTIFICATION_STATUSES = ['queued', 'sent'] as const;

export function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function requireSyncSecret(req: Request): Response | null {
  const expectedSecret = Deno.env.get('SYNC_SECRET');
  if (!expectedSecret) {
    return json(500, { error: 'Missing SYNC_SECRET env' });
  }

  if (req.headers.get('x-sync-secret') !== expectedSecret) {
    return json(401, { error: 'Unauthorized' });
  }

  return null;
}

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function buildNotificationDedupeKey(
  notificationType: string,
  ...parts: (string | number | null | undefined)[]
): string {
  const normalizedParts = parts
    .map((part) => (part === null || part === undefined ? null : String(part).trim()))
    .filter((part): part is string => Boolean(part));

  return [notificationType.trim(), ...normalizedParts].join(':');
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  if (!authHeader) return null;

  const trimmed = authHeader.trim();
  if (!trimmed) return null;

  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed.slice(7).trim() : trimmed;
}

export async function requireAuthenticatedUser(req: Request) {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !anonKey) {
    return {
      user: null,
      response: json(500, { error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }),
    };
  }

  const token = readBearerToken(req);
  if (!token) {
    return {
      user: null,
      response: json(401, { error: 'Missing Authorization header' }),
    };
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return {
      user: null,
      response: json(401, { error: 'Invalid JWT' }),
    };
  }

  return {
    user: data.user,
    response: null,
  };
}

function chunk<T>(items: T[], size: number): T[][];
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

async function reserveNotificationLog(supabase: any, request: DispatchNotificationRequest) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('notifications_log')
    .upsert(
      {
        user_id: request.userId,
        push_token: request.pushToken,
        notification_type: request.notificationType,
        dedupe_key: request.dedupeKey,
        title: request.title,
        body: request.body,
        payload: request.data ?? {},
        status: 'queued',
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    return null;
  }

  return data.id as string;
}

async function updateNotificationLog(
  supabase: any,
  logId: string,
  patch: Record<string, unknown>,
) {
  await supabase
    .from('notifications_log')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', logId);
}

async function sendExpoBatch(messages: ReservedNotification[]): Promise<ExpoPushTicket[]> {
  const payload = messages.map((message) => ({
    to: message.pushToken,
    title: message.title,
    body: message.body,
    sound: 'default',
    channelId: 'default',
    data: message.data ?? {},
  }));

  const response = await fetch(EXPO_PUSH_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Expo push API failed with ${response.status}: ${JSON.stringify(result)}`);
  }

  const tickets = Array.isArray(result?.data) ? result.data : [];
  return tickets as ExpoPushTicket[];
}

export async function fetchAllPushTokens(supabase: any) {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('user_id, push_token, platform, updated_at');

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchPushTokensForUsers(supabase: any, userIds: string[]) {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from('push_tokens')
    .select('user_id, push_token, platform, updated_at')
    .in('user_id', userIds);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchExistingNotificationDedupeKeys(
  supabase: any,
  dedupeKeys: string[],
  options?: {
    statuses?: string[];
  },
) {
  const uniqueKeys = Array.from(
    new Set(dedupeKeys.map((key) => key.trim()).filter((key) => key.length > 0)),
  );

  if (uniqueKeys.length === 0) {
    return new Set<string>();
  }

  let query = supabase.from('notifications_log').select('dedupe_key').in('dedupe_key', uniqueKeys);

  const statuses = Array.from(
    new Set(
      (options?.statuses ?? [])
        .map((status) => status.trim())
        .filter((status) => status.length > 0),
    ),
  );

  if (statuses.length > 0) {
    query = query.in('status', statuses);
  }

  const { data, error } = await query;

  if (error) throw error;

  return new Set(
    ((data as { dedupe_key?: string | null }[] | null) ?? [])
      .map((row) => row.dedupe_key?.trim() ?? '')
      .filter((key) => key.length > 0),
  );
}

export async function hasRecentNotificationOfTypes(
  supabase: any,
  {
    userId,
    notificationTypes,
    sinceIso,
  }: {
    userId: string;
    notificationTypes: string[];
    sinceIso: string;
  },
) {
  const normalizedTypes = Array.from(
    new Set(notificationTypes.map((value) => value.trim()).filter((value) => value.length > 0)),
  );

  if (!userId || normalizedTypes.length === 0 || !sinceIso) {
    return false;
  }

  const { data, error } = await supabase
    .from('notifications_log')
    .select('id')
    .eq('user_id', userId)
    .in('notification_type', normalizedTypes)
    .in('status', [...ACTIVE_NOTIFICATION_STATUSES])
    .gte('created_at', sinceIso)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return Boolean(data?.id);
}

export async function dispatchNotifications(
  supabase: any,
  requests: DispatchNotificationRequest[],
) {
  const reserved: ReservedNotification[] = [];
  let skipped = 0;

  for (const request of requests) {
    if (!request.userId || !request.pushToken || !isExpoPushToken(request.pushToken)) {
      skipped += 1;
      continue;
    }

    const logId = await reserveNotificationLog(supabase, request);
    if (!logId) {
      skipped += 1;
      continue;
    }

    reserved.push({ ...request, logId });
  }

  let sent = 0;
  let failed = 0;

  for (const batch of chunk(reserved, 100)) {
    const tickets = await sendExpoBatch(batch);

    for (let index = 0; index < batch.length; index += 1) {
      const notification = batch[index];
      const ticket = tickets[index];

      if (ticket?.status === 'ok') {
        sent += 1;
        await updateNotificationLog(supabase, notification.logId, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: null,
        });
        continue;
      }

      failed += 1;
      await updateNotificationLog(supabase, notification.logId, {
        status: 'failed',
        error_message: ticket?.message ?? ticket?.details?.error ?? 'Unknown Expo push error',
      });

      if (ticket?.details?.error === 'DeviceNotRegistered') {
        await supabase.from('push_tokens').delete().eq('push_token', notification.pushToken);
      }
    }
  }

  return {
    total: requests.length,
    queued: reserved.length,
    skipped,
    sent,
    failed,
  };
}
