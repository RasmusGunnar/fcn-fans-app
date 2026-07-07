// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  fetchPushPreferencesByUserIds,
  getStartOfLocalDayIso,
  isPushPreferenceEnabled,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type RequestBody = {
  postId?: string;
};

type CommunityPostRow = {
  id: string;
  author_id: string;
  actor_type: string | null;
  actor_id: string | null;
  community_id: string | null;
  text: string | null;
  poll_data: Record<string, unknown> | null;
  post_type: string | null;
};

type CommunityNotificationType = 'community_post' | 'community_poll';

type EnqueueNotificationResult = {
  job_id: string;
  inserted: boolean;
  job_status: string;
  skip_reason: string | null;
};

type ProcessPushQueueResult = {
  ok?: boolean;
  claimed?: number;
  requested?: number;
  sent?: number;
  delivered?: number;
  skipped?: number;
  failed?: number;
  notClaimable?: number;
  requestedJobIds?: string[];
  claimedJobIds?: string[];
  notClaimableJobIds?: string[];
  totals?: {
    activeDevices?: number;
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

type CommunityPostJobResult = {
  recipientUserId: string;
  jobId: string | null;
  inserted: boolean;
  jobStatus: string | null;
  skippedReason: 'duplicate' | 'enqueue_failed' | null;
  process?: ProcessPushQueueResult | null;
};

const COMMUNITY_NOTIFICATION_TYPES: CommunityNotificationType[] = [
  'community_post',
  'community_poll',
];
const V2_DAILY_CAP_STATUSES = ['queued', 'processing', 'sent_to_expo', 'delivered'];
const QUEUE_BATCH_SIZE = 25;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function truncatePreview(value: string | null | undefined, limit = 120) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'Der er et nyt opslag i dit f\u00E6llesskab.';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}\u2026`;
}

function readPollQuestion(pollData: Record<string, unknown> | null | undefined) {
  return readString(pollData?.question);
}

async function readRequestBody(req: Request): Promise<RequestBody> {
  try {
    const raw = await req.text();
    if (!raw.trim()) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as RequestBody;
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

async function fetchUserIdsWithCommunityDailyCap(
  supabase: any,
  {
    userIds,
    sinceIso,
  }: {
    userIds: string[];
    sinceIso: string;
  },
) {
  const normalizedUserIds = Array.from(
    new Set(userIds.map((value) => value.trim()).filter((value) => value.length > 0)),
  );

  if (normalizedUserIds.length === 0 || !sinceIso) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from('notification_jobs')
    .select('recipient_user_id')
    .in('recipient_user_id', normalizedUserIds)
    .in('notification_type', COMMUNITY_NOTIFICATION_TYPES)
    .in('status', V2_DAILY_CAP_STATUSES)
    .gte('created_at', sinceIso);

  if (error) throw error;

  return new Set(
    ((data as { recipient_user_id?: string | null }[] | null) ?? [])
      .map((row) => row.recipient_user_id?.trim() ?? '')
      .filter((userId) => userId.length > 0),
  );
}

async function enqueueCommunityPostJob(params: {
  supabase: any;
  recipientUserId: string;
  actorUserId: string;
  notificationType: CommunityNotificationType;
  title: string;
  body: string;
  dedupeKey: string;
  data: Record<string, unknown>;
  postId: string;
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
      p_source_table: 'posts',
      p_source_id: params.postId,
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

function getProcessCounts(results: CommunityPostJobResult[], skippedDailyCap: number) {
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
  const skippedByJobState = results.filter((result) => Boolean(result.skippedReason)).length;
  const enqueueFailures = results.filter(
    (result) => result.skippedReason === 'enqueue_failed',
  ).length;

  return {
    total: insertedJobs.length,
    queued: processTotals.deliveriesCreated + unprocessedQueued,
    skipped: skippedDailyCap + skippedByJobState + processTotals.skipped,
    sent: processTotals.sentToExpo,
    failed: enqueueFailures + processTotals.failed,
  };
}

function summarizeProcessResults(results: ProcessPushQueueResult[]) {
  return results.reduce(
    (acc, result) => ({
      requested: acc.requested + (result.requested ?? result.requestedJobIds?.length ?? 0),
      claimed: acc.claimed + (result.claimed ?? result.claimedJobIds?.length ?? 0),
      sent: acc.sent + (result.sent ?? result.totals?.sentToExpo ?? 0),
      delivered: acc.delivered + (result.delivered ?? 0),
      skipped: acc.skipped + (result.skipped ?? result.totals?.skipped ?? 0),
      failed: acc.failed + (result.failed ?? result.totals?.failed ?? 0),
      notClaimable:
        acc.notClaimable + (result.notClaimable ?? result.notClaimableJobIds?.length ?? 0),
    }),
    { requested: 0, claimed: 0, sent: 0, delivered: 0, skipped: 0, failed: 0, notClaimable: 0 },
  );
}

Deno.serve(async (req) => {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.response) {
      return auth.response;
    }

    const callerUserId = auth.user.id as string;
    const body = await readRequestBody(req);
    const postId = readString(body.postId);

    if (!postId) {
      return json(400, { error: 'Missing postId' });
    }

    const supabase = createAdminClient();
    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, actor_type, actor_id, community_id, text, poll_data, post_type')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      throw postError;
    }

    const post = (postData as CommunityPostRow | null) ?? null;
    if (!post) {
      return json(404, { error: 'Post not found' });
    }

    if (post.author_id !== callerUserId) {
      return json(403, { error: 'Only the post author can trigger community push' });
    }

    if (readString(post.post_type) === 'media_article') {
      console.log('[push_community_posts] skipped media article post', { postId });
      return json(200, { ok: true, skipped: 'media_article_post' });
    }

    const communityId = readString(post.community_id);
    if (!communityId || readString(post.actor_type) !== 'community') {
      console.log('[push_community_posts] skipped non-community post', {
        postId,
        communityId,
        actorType: post.actor_type,
      });
      return json(200, { ok: true, skipped: 'non_community_post' });
    }

    const { data: communityData, error: communityError } = await supabase
      .from('communities')
      .select('id, name')
      .eq('id', communityId)
      .maybeSingle();

    if (communityError) {
      throw communityError;
    }

    const communityName = readString(communityData?.name ?? null) ?? 'Dit f\u00E6llesskab';

    const { data: membershipData, error: membershipError } = await supabase
      .from('community_members')
      .select('user_id')
      .eq('community_id', communityId);

    if (membershipError) {
      throw membershipError;
    }

    const memberUserIds = Array.from(
      new Set(
        ((membershipData as { user_id?: string | null }[] | null) ?? [])
          .map((row) => readString(row.user_id))
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    const recipientsAfterSelf = memberUserIds.filter((userId) => userId !== callerUserId);
    const recipientsSkippedSelf = memberUserIds.length - recipientsAfterSelf.length;

    if (recipientsAfterSelf.length === 0) {
      console.log('[push_community_posts] skipped no eligible members', {
        postId,
        communityId,
        recipientsSkippedSelf,
      });
      return json(200, {
        ok: true,
        skipped: 'no_eligible_members',
        recipientsSkippedSelf,
      });
    }

    const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, recipientsAfterSelf);
    const usersWithPreferenceEnabled = recipientsAfterSelf.filter((userId) =>
      isPushPreferenceEnabled(preferencesByUserId, userId, 'community_activity'),
    );
    const recipientsSkippedPreference =
      recipientsAfterSelf.length - usersWithPreferenceEnabled.length;

    if (usersWithPreferenceEnabled.length === 0) {
      console.log('[push_community_posts] skipped preferences disabled', {
        postId,
        communityId,
        recipientsSkippedSelf,
        recipientsSkippedPreference,
      });
      return json(200, {
        ok: true,
        skipped: 'preferences_disabled',
        recipientsSkippedSelf,
        recipientsSkippedPreference,
      });
    }

    const isPoll = Boolean(readPollQuestion(post.poll_data));
    const notificationType: CommunityNotificationType = isPoll
      ? 'community_poll'
      : 'community_post';
    const targetType = notificationType;
    const startOfDayIso = getStartOfLocalDayIso(new Date());
    const cappedUserIds = await fetchUserIdsWithCommunityDailyCap(supabase, {
      userIds: usersWithPreferenceEnabled,
      sinceIso: startOfDayIso,
    });
    const usersAfterDailyCap = usersWithPreferenceEnabled.filter(
      (userId) => !cappedUserIds.has(userId),
    );
    const recipientsSkippedCap = usersWithPreferenceEnabled.length - usersAfterDailyCap.length;

    const title = isPoll
      ? `${communityName} har lavet en afstemning`
      : `${communityName}: nyt opslag`;
    const pushBody = isPoll
      ? truncatePreview(readPollQuestion(post.poll_data))
      : truncatePreview(post.text);
    const pushData = {
      notificationType,
      targetType,
      type: 'post',
      postId: post.id,
      communityId,
      isPoll,
      url: `fcnfans://post/${post.id}`,
    };

    const jobs: CommunityPostJobResult[] = [];
    for (const recipientUserId of usersAfterDailyCap) {
      const dedupeKey = buildNotificationDedupeKey(notificationType, post.id, recipientUserId);

      try {
        const enqueueResult = await enqueueCommunityPostJob({
          supabase,
          recipientUserId,
          actorUserId: callerUserId,
          notificationType,
          title,
          body: pushBody,
          dedupeKey,
          data: pushData,
          postId: post.id,
        });

        jobs.push({
          recipientUserId,
          jobId: enqueueResult.job_id,
          inserted: enqueueResult.inserted,
          jobStatus: enqueueResult.job_status,
          skippedReason: enqueueResult.inserted ? null : 'duplicate',
          process: null,
        });
      } catch (error) {
        console.warn('[push_community_posts] enqueue failed for recipient', {
          postId: post.id,
          communityId,
          notificationType,
          recipientUserId,
          error: String(error),
        });
        jobs.push({
          recipientUserId,
          jobId: null,
          inserted: false,
          jobStatus: null,
          skippedReason: 'enqueue_failed',
          process: null,
        });
      }
    }

    const insertedJobs = jobs.filter((job) => job.inserted && job.jobId);
    const duplicateJobs = jobs.filter((job) => job.skippedReason === 'duplicate');
    const failedJobs = jobs.filter((job) => job.skippedReason === 'enqueue_failed');
    const processResults: ProcessPushQueueResult[] = [];
    const processFailures: { jobIds: string[]; error: string }[] = [];

    if (insertedJobs.length > 0) {
      const jobsById = new Map(
        insertedJobs
          .filter((job): job is CommunityPostJobResult & { jobId: string } => Boolean(job.jobId))
          .map((job) => [job.jobId, job]),
      );

      for (const jobIdChunk of chunk(
        insertedJobs.map((job) => job.jobId).filter((jobId): jobId is string => Boolean(jobId)),
        QUEUE_BATCH_SIZE,
      )) {
        try {
          const processResult = await processQueuedJobs(jobIdChunk);
          processResults.push(processResult);

          for (const processedJob of processResult.jobs ?? []) {
            const job = processedJob.jobId ? jobsById.get(processedJob.jobId) : null;
            if (!job) continue;

            job.process = processResult;
            job.jobStatus =
              readString(processedJob.status) ?? readString(job.jobStatus) ?? 'queued';
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
          console.warn('[push_community_posts] process_push_queue chunk failed after enqueue', {
            postId: post.id,
            communityId,
            notificationType,
            jobIds: jobIdChunk,
            error: String(error),
          });
        }
      }
    }

    const counts = getProcessCounts(jobs, recipientsSkippedCap);
    const processSummary = summarizeProcessResults(processResults);
    const processClaimedJobIds = processResults.flatMap((result) => result.claimedJobIds ?? []);
    const processNotClaimableJobIds = processResults.flatMap(
      (result) => result.notClaimableJobIds ?? [],
    );
    const unprocessedJobIds = insertedJobs
      .map((job) => job.jobId)
      .filter((jobId): jobId is string => Boolean(jobId))
      .filter(
        (jobId) =>
          !processClaimedJobIds.includes(jobId) && !processNotClaimableJobIds.includes(jobId),
      );
    const summary = {
      postId: post.id,
      communityId,
      notificationType,
      recipientsTargeted: usersWithPreferenceEnabled.length,
      totalRecipients: memberUserIds.length,
      recipientsSkippedSelf,
      recipientsSkippedNonMembers: 0,
      recipientsSkippedPreference,
      recipientsSkippedNoToken: 0,
      recipientsSkippedCap,
      recipientsSkippedExistingDedupe: duplicateJobs.length,
      requestsPrepared: insertedJobs.length,
      jobsInserted: insertedJobs.length,
      jobsDuplicate: duplicateJobs.length,
      jobsSkippedDailyCap: recipientsSkippedCap,
      jobsFailed: failedJobs.length,
      jobsQueuedWithoutImmediateProcessing: unprocessedJobIds.length,
      queueProcessChunks: processResults.length,
      queueProcessFailures: processFailures.length,
      queueRequested: processSummary.requested,
      queueClaimed: processSummary.claimed,
      queueSent: processSummary.sent,
      queueDelivered: processSummary.delivered,
      queueSkipped: processSummary.skipped,
      queueFailed: processSummary.failed,
      queueNotClaimable: processSummary.notClaimable,
    };

    if (jobs.length === 0) {
      console.log('[push_community_posts] skipped no requests', summary);
      return json(200, {
        ok: true,
        skipped: 'no_requests',
        skippedReason: recipientsSkippedCap > 0 ? 'daily_cap_reached' : 'no_requests',
        engine: 'v2',
        ...summary,
      });
    }

    console.log('[push_community_posts] dispatch', {
      ...summary,
      engine: 'v2',
      total: counts.total,
      queued: counts.queued,
      skipped: counts.skipped,
      sent: counts.sent,
      failed: counts.failed,
    });

    return json(200, {
      ok: true,
      engine: 'v2',
      ...summary,
      total: counts.total,
      queued: counts.queued,
      skipped: counts.skipped,
      sent: counts.sent,
      failed: counts.failed,
      jobIds: insertedJobs
        .map((job) => job.jobId)
        .filter(Boolean)
        .slice(0, 25),
      processedJobIds: insertedJobs
        .map((job) => job.jobId)
        .filter((jobId): jobId is string => Boolean(jobId) && processClaimedJobIds.includes(jobId)),
      notClaimableJobIds: processNotClaimableJobIds,
      unprocessedJobIds,
      processFailures: processFailures.map((failure) => ({
        jobIds: failure.jobIds,
        error: failure.error,
      })),
      skippedReasons: {
        duplicate: duplicateJobs.length,
        daily_cap_reached: recipientsSkippedCap,
        enqueue_failed: failedJobs.length,
      },
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
