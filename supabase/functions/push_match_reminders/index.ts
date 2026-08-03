// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  fetchPushPreferencesByUserIds,
  isPushPreferenceEnabled,
  json,
  requireSyncSecret,
} from '../_shared/push.ts';

const FCN_TEAM_PROVIDER_ID = '133890';
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const LEAD_MINUTES = 120;
const WINDOW_MINUTES = 15;
const QUEUE_BATCH_SIZE = 25;

type MatchReminderRequest = {
  fixtureId?: string;
  targetUserIds?: string[];
  nowIso?: string;
  dryRun?: boolean;
};

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

type MatchReminderCandidate = {
  userId: string;
  fixtureId: string;
  notificationType: 'match_checkin_reminder';
  dedupeKey: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

type MatchReminderJobResult = {
  recipientUserId: string;
  jobId: string | null;
  inserted: boolean;
  skippedReason: 'duplicate' | 'enqueue_failed' | null;
  process?: ProcessPushQueueResult | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u00E6/g, 'ae')
    .replace(/\u00F8/g, 'o')
    .replace(/\u00E5/g, 'a')
    .replace(/\u00C3\u00A6/g, 'ae')
    .replace(/\u00C3\u00B8/g, 'o')
    .replace(/\u00C3\u00A5/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function readString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => readString(entry)).filter((entry): entry is string => Boolean(entry));
}

function readRaw(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function isFcnFixture(row: Record<string, unknown>): boolean {
  const raw = readRaw(row.raw);
  const homeId =
    readString(row.home_team_provider_id) ??
    readString(row.home_team_id) ??
    readString(raw?.idHomeTeam);
  const awayId =
    readString(row.away_team_provider_id) ??
    readString(row.away_team_id) ??
    readString(raw?.idAwayTeam);

  if (homeId === FCN_TEAM_PROVIDER_ID || awayId === FCN_TEAM_PROVIDER_ID) {
    return true;
  }

  const homeTeam = normalizeText(row.home_team);
  const awayTeam = normalizeText(row.away_team);
  return FCN_TEAM_NAME_MATCHERS.some(
    (matcher) => homeTeam.includes(matcher) || awayTeam.includes(matcher),
  );
}

function hasRequiredFixtureFields(row: Record<string, unknown>): boolean {
  return Boolean(readString(row.id) && readString(row.kickoff_at));
}

function formatTimeDa(iso: string): string {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen',
  });
}

function buildOpponentLabel(row: Record<string, unknown>): string {
  const homeTeam = readString(row.home_team) ?? 'modstanderen';
  const awayTeam = readString(row.away_team) ?? 'modstanderen';
  const normalizedHome = normalizeText(homeTeam);
  const normalizedAway = normalizeText(awayTeam);
  const homeIsFcn = FCN_TEAM_NAME_MATCHERS.some((matcher) => normalizedHome.includes(matcher));
  const awayIsFcn = FCN_TEAM_NAME_MATCHERS.some((matcher) => normalizedAway.includes(matcher));

  if (homeIsFcn && !awayIsFcn) return awayTeam;
  if (awayIsFcn && !homeIsFcn) return homeTeam;
  return `${homeTeam} - ${awayTeam}`;
}

function pickCopyVariant<T>(seed: string, variants: T[]): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return variants[hash % variants.length] ?? variants[0];
}

function getMatchReminderCopy(seed: string, opponent: string, kickoffAt: string) {
  const kickoffTime = formatTimeDa(kickoffAt);

  return pickCopyVariant(seed, [
    {
      title: 'Er du p\u00E5 stadion?',
      body: `FCN m\u00F8der ${opponent} kl. ${kickoffTime}. Husk at tjekke ind til kampen i appen.`,
    },
    {
      title: 'Klar til kampdag?',
      body: `FCN m\u00F8der ${opponent} kl. ${kickoffTime}. Tjek ind, n\u00E5r du er p\u00E5 stadion.`,
    },
    {
      title: 'Stemningen starter snart',
      body: `${opponent} venter kl. ${kickoffTime}. \u00C5bn FCN Fans og tjek ind p\u00E5 stadion.`,
    },
  ]);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchGoingRsvpUserIds(supabase: any, fixtureId: string) {
  const { data, error } = await supabase
    .from('rsvps')
    .select('user_id')
    .eq('entity_type', 'match')
    .eq('entity_id', fixtureId)
    .eq('status', 'going');

  if (error) throw error;

  return Array.from(
    new Set(
      ((data as { user_id?: string | null }[] | null) ?? [])
        .map((row) => readString(row.user_id))
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );
}

async function fetchCheckedInUserIds(supabase: any, fixtureId: string) {
  const { data, error } = await supabase
    .from('match_checkins')
    .select('user_id')
    .eq('match_id', fixtureId);

  if (error) throw error;

  return new Set(
    ((data as { user_id?: string | null }[] | null) ?? [])
      .map((row) => readString(row.user_id))
      .filter((userId): userId is string => Boolean(userId)),
  );
}

async function fetchExistingNotificationJobDedupeKeys(supabase: any, dedupeKeys: string[]) {
  const uniqueDedupeKeys = Array.from(new Set(dedupeKeys.filter((key) => key.length > 0)));
  if (uniqueDedupeKeys.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from('notification_jobs')
    .select('dedupe_key')
    .in('dedupe_key', uniqueDedupeKeys);

  if (error) throw error;

  return new Set(
    ((data as { dedupe_key?: string | null }[] | null) ?? [])
      .map((row) => readString(row.dedupe_key))
      .filter((key): key is string => Boolean(key)),
  );
}

async function enqueueMatchReminderJob(params: {
  supabase: any;
  candidate: MatchReminderCandidate;
}) {
  const { data, error } = await params.supabase
    .rpc('enqueue_notification', {
      p_recipient_user_id: params.candidate.userId,
      p_notification_type: params.candidate.notificationType,
      p_title: params.candidate.title,
      p_body: params.candidate.body,
      p_dedupe_key: params.candidate.dedupeKey,
      p_data: params.candidate.data,
      p_actor_user_id: null,
      p_preference_key: 'matchday_checkin',
      p_source_table: 'fixtures',
      p_source_id: params.candidate.fixtureId,
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

function getProcessCounts(results: MatchReminderJobResult[]) {
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

async function readRequestBody(req: Request): Promise<MatchReminderRequest> {
  try {
    const raw = await req.text();
    if (!raw.trim()) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as MatchReminderRequest;
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  try {
    const body = await readRequestBody(req);
    const fixtureId = readString(body.fixtureId);
    const targetUserIds = readStringArray(body.targetUserIds);
    const targetUserIdSet = new Set(targetUserIds);
    const dryRun = body.dryRun === true;
    const manualOverride =
      dryRun || Boolean(fixtureId) || targetUserIds.length > 0 || Boolean(readString(body.nowIso));

    if (manualOverride && !dryRun && targetUserIds.length === 0) {
      return json(400, {
        error:
          'Manual match reminder runs must include targetUserIds or use dryRun to avoid broad sends.',
      });
    }

    const now = readString(body.nowIso) ? new Date(String(body.nowIso)) : new Date();
    if (!isValidDate(now)) {
      return json(400, { error: 'Invalid nowIso' });
    }

    const supabase = createAdminClient();
    const windowStart = new Date(now.getTime() + (LEAD_MINUTES - WINDOW_MINUTES) * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LEAD_MINUTES * 60 * 1000);

    let fixtures: any[] = [];
    if (fixtureId) {
      const { data, error } = await supabase
        .from('fixtures')
        .select('*')
        .eq('id', fixtureId)
        .limit(1);

      if (error) throw error;
      fixtures = Array.isArray(data) ? data : [];
    } else {
      const { data, error } = await supabase
        .from('fixtures')
        .select('*')
        .gt('kickoff_at', windowStart.toISOString())
        .lte('kickoff_at', windowEnd.toISOString())
        .order('kickoff_at', { ascending: true });

      if (error) throw error;
      fixtures = Array.isArray(data) ? data : [];
    }

    const eligibleFixtures = fixtures
      .filter((fixture) => hasRequiredFixtureFields(fixture as Record<string, unknown>))
      .filter((fixture) => isFcnFixture(fixture as Record<string, unknown>));

    const candidateRequests: MatchReminderCandidate[] = [];
    let rsvpUsersMatched = 0;
    let recipientsTargeted = 0;
    let recipientsSkippedCheckedIn = 0;
    let recipientsSkippedMissingToken = 0;
    let recipientsSkippedPreference = 0;

    for (const fixture of eligibleFixtures) {
      const kickoffAt = readString(fixture.kickoff_at);
      const fixtureUuid = readString(fixture.id);
      if (!kickoffAt || !fixtureUuid) continue;

      const goingUserIds = await fetchGoingRsvpUserIds(supabase, fixtureUuid);
      const scopedUserIds =
        targetUserIdSet.size > 0
          ? goingUserIds.filter((userId) => targetUserIdSet.has(userId))
          : goingUserIds;

      rsvpUsersMatched += scopedUserIds.length;
      if (scopedUserIds.length === 0) continue;

      const checkedInUserIds = await fetchCheckedInUserIds(supabase, fixtureUuid);
      const notCheckedInUserIds = scopedUserIds.filter((userId) => !checkedInUserIds.has(userId));

      recipientsSkippedCheckedIn += scopedUserIds.length - notCheckedInUserIds.length;
      if (notCheckedInUserIds.length === 0) continue;

      const preferencesByUserId = await fetchPushPreferencesByUserIds(
        supabase,
        notCheckedInUserIds,
      );
      const usersWithPreferenceEnabled = notCheckedInUserIds.filter((userId) =>
        isPushPreferenceEnabled(preferencesByUserId, userId, 'matchday_checkin'),
      );

      recipientsSkippedPreference += notCheckedInUserIds.length - usersWithPreferenceEnabled.length;
      if (usersWithPreferenceEnabled.length === 0) continue;

      recipientsTargeted += usersWithPreferenceEnabled.length;

      const opponent = buildOpponentLabel(fixture as Record<string, unknown>);

      for (const userId of usersWithPreferenceEnabled) {
        const copy = getMatchReminderCopy(`${fixtureUuid}:${userId}`, opponent, kickoffAt);
        candidateRequests.push({
          userId,
          fixtureId: fixtureUuid,
          notificationType: 'match_checkin_reminder',
          dedupeKey: buildNotificationDedupeKey('match_checkin_reminder', fixtureUuid, userId),
          title: copy.title,
          body: copy.body,
          data: {
            type: 'match',
            fixtureId: fixtureUuid,
            url: `fcnfans://match/${fixtureUuid}`,
          },
        });
      }
    }

    const existingDedupeKeys = await fetchExistingNotificationJobDedupeKeys(
      supabase,
      candidateRequests.map((request) => request.dedupeKey),
    );

    const requests = candidateRequests.filter(
      (request) => !existingDedupeKeys.has(request.dedupeKey),
    );

    let recipientsSkippedExistingDedupe = candidateRequests.length - requests.length;

    const summary = {
      mode: fixtureId ? 'fixture_id' : 'window',
      nowIso: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      fixturesFetched: fixtures.length,
      fixturesMatched: eligibleFixtures.length,
      rsvpUsersMatched,
      recipientsTargeted,
      recipientsSkippedCheckedIn,
      recipientsSkippedPreference,
      recipientsSkippedMissingToken,
      recipientsSkippedExistingDedupe,
      requestsPrepared: requests.length,
      dryRun,
      targetedUsers: targetUserIdSet.size,
    };

    if (dryRun) {
      console.log('[push_match_reminders] dry run', summary);
      return json(200, {
        ok: true,
        engine: 'v2',
        ...summary,
        sampleRequests: requests.slice(0, 3).map((request) => ({
          userId: request.userId,
          notificationType: request.notificationType,
          title: request.title,
          body: request.body,
          data: request.data,
          dedupeKey: request.dedupeKey,
        })),
      });
    }

    const jobs: MatchReminderJobResult[] = [];
    const processResults: ProcessPushQueueResult[] = [];
    const processFailures: { jobIds: string[]; error: string }[] = [];

    for (const request of requests) {
      try {
        const enqueueResult = await enqueueMatchReminderJob({
          supabase,
          candidate: request,
        });
        jobs.push({
          recipientUserId: request.userId,
          jobId: enqueueResult.job_id,
          inserted: enqueueResult.inserted,
          skippedReason: enqueueResult.inserted ? null : 'duplicate',
        });
      } catch (error) {
        console.warn('[push_match_reminders] enqueue failed', {
          fixtureId: request.fixtureId,
          recipientUserId: request.userId,
          error: String(error),
        });
        jobs.push({
          recipientUserId: request.userId,
          jobId: null,
          inserted: false,
          skippedReason: 'enqueue_failed',
        });
      }
    }

    recipientsSkippedExistingDedupe += jobs.filter(
      (job) => job.skippedReason === 'duplicate',
    ).length;

    const insertedJobIds = jobs
      .filter((job): job is MatchReminderJobResult & { jobId: string } =>
        Boolean(job.inserted && job.jobId),
      )
      .map((job) => job.jobId);

    if (insertedJobIds.length > 0) {
      const jobsById = new Map(
        jobs
          .filter((job): job is MatchReminderJobResult & { jobId: string } => Boolean(job.jobId))
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
          console.warn('[push_match_reminders] process_push_queue chunk failed after enqueue', {
            jobIds: jobIdChunk,
            error: String(error),
          });
        }
      }
    }

    const result = getProcessCounts(jobs);
    const finalSummary = {
      ...summary,
      recipientsSkippedExistingDedupe,
      jobsInserted: insertedJobIds.length,
      queueProcessChunks: processResults.length,
      queueProcessFailures: processFailures.length,
    };

    console.log('[push_match_reminders] dispatch', {
      ...finalSummary,
      engine: 'v2',
      total: result.total,
      queued: result.queued,
      skipped: result.skipped,
      sent: result.sent,
      failed: result.failed,
    });

    return json(200, {
      ok: true,
      engine: 'v2',
      ...finalSummary,
      processFailures,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
