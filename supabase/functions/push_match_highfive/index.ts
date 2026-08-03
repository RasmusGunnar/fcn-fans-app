// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  fetchPushPreferencesByUserIds,
  isPushPreferenceEnabled,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type MatchHighfiveRequest = {
  matchId?: unknown;
  toUserId?: unknown;
};

type EnqueueNotificationResult = {
  job_id: string;
  inserted: boolean;
  job_status: string;
  skip_reason: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function pickCopy(seed: string, profileName: string) {
  const variants = [
    `${profileName} har givet dig en highfive \uD83D\uDE4C`,
    `${profileName} sender en highfive fra tribunen \uD83D\uDE4C`,
    `Highfive fra ${profileName} \uD83D\uDE4C`,
  ];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return variants[hash % variants.length] ?? variants[0];
}

async function readBody(req: Request): Promise<MatchHighfiveRequest> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as MatchHighfiveRequest)
      : {};
  } catch {
    return {};
  }
}

async function processQueuedJob(jobId: string) {
  const supabaseUrl = readString(Deno.env.get('SUPABASE_URL'));
  const syncSecret = readString(Deno.env.get('SYNC_SECRET'));
  if (!supabaseUrl || !syncSecret) {
    throw new Error('Missing SUPABASE_URL or SYNC_SECRET');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/process_push_queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': syncSecret,
    },
    body: JSON.stringify({ jobId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error(
      `process_push_queue failed with ${response.status}: ${JSON.stringify(result ?? {})}`,
    );
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const { user, response: authError } = await requireAuthenticatedUser(req);
  if (authError) return authError;
  if (!user) return json(401, { error: 'Unauthorized' });

  const request = await readBody(req);
  const matchId = readUuid(request.matchId);
  const toUserId = readUuid(request.toUserId);
  const fromUserId = readUuid(user.id);

  if (!matchId || !toUserId || !fromUserId) {
    return json(400, { error: 'Valid matchId and toUserId are required' });
  }
  if (fromUserId === toUserId) {
    return json(400, { error: 'Self-highfives cannot create notifications' });
  }

  try {
    const supabase = createAdminClient();
    const { data: highfive, error: highfiveError } = await supabase
      .from('match_highfives')
      .select('match_id, from_user_id, to_user_id')
      .eq('match_id', matchId)
      .eq('from_user_id', fromUserId)
      .eq('to_user_id', toUserId)
      .maybeSingle();

    if (highfiveError) throw highfiveError;
    if (!highfive) {
      return json(404, { error: 'Highfive not found' });
    }

    const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, [toUserId]);
    if (!isPushPreferenceEnabled(preferencesByUserId, toUserId, 'highfives')) {
      return json(200, {
        ok: true,
        engine: 'v2',
        skipped: 'preference_disabled',
        inserted: false,
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', fromUserId)
      .maybeSingle();
    if (profileError) throw profileError;

    const profileName =
      readString(profile?.display_name) ?? readString(profile?.username) ?? 'En FCN-fan';
    const dedupeKey = buildNotificationDedupeKey('match_highfive', matchId, fromUserId, toUserId);
    const title = 'Highfive på kampdagen';
    const body = pickCopy(dedupeKey, profileName);

    const { data, error } = await supabase
      .rpc('enqueue_notification', {
        p_recipient_user_id: toUserId,
        p_notification_type: 'match_highfive',
        p_title: title,
        p_body: body,
        p_dedupe_key: dedupeKey,
        p_data: {
          targetType: 'match',
          type: 'match',
          notificationType: 'match_highfive',
          fixtureId: matchId,
          matchId,
          url: `fcnfans://match/${matchId}`,
        },
        p_actor_user_id: fromUserId,
        p_preference_key: 'highfives',
        p_source_table: 'fixtures',
        p_source_id: matchId,
        p_next_attempt_at: new Date().toISOString(),
        p_max_attempts: 5,
      })
      .single();

    if (error) throw error;
    const enqueueResult = data as EnqueueNotificationResult;
    if (!enqueueResult.inserted) {
      return json(200, {
        ok: true,
        engine: 'v2',
        jobId: enqueueResult.job_id,
        inserted: false,
        skipped: 'duplicate',
      });
    }

    try {
      const process = await processQueuedJob(enqueueResult.job_id);
      return json(200, {
        ok: true,
        engine: 'v2',
        jobId: enqueueResult.job_id,
        inserted: true,
        process,
      });
    } catch (processError) {
      console.warn('[push_match_highfive] queue processing failed after enqueue', {
        jobId: enqueueResult.job_id,
        error: String(processError),
      });
      return json(200, {
        ok: true,
        engine: 'v2',
        jobId: enqueueResult.job_id,
        inserted: true,
        processError: String(processError),
      });
    }
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
