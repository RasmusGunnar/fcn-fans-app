// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  json,
  requireSyncSecret,
} from '../_shared/push.ts';

const LOOKBACK_HOURS = 24;
const MIN_LIKES = 8;
const MIN_COMMENTS = 4;
const MAX_POSTS_PER_RUN = 1;
const QUEUE_BATCH_SIZE = 25;

type HotPostType = 'post' | 'media_article';

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

type HotPostJobResult = {
  recipientUserId: string;
  postId: string;
  jobId: string | null;
  inserted: boolean;
  skippedReason: 'duplicate' | 'enqueue_failed' | null;
  process?: ProcessPushQueueResult | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isHomePost(feedTargets: unknown): boolean {
  if (!Array.isArray(feedTargets)) return true;
  return feedTargets.length === 0 || feedTargets.includes('home');
}

function normalizeHotPostType(value: unknown): HotPostType {
  return readString(value) === 'media_article' ? 'media_article' : 'post';
}

function pickCopyVariant<T>(seed: string, variants: T[]): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return variants[hash % variants.length] ?? variants[0];
}

function getHotPostCopy(seed: string, postType: HotPostType) {
  if (postType === 'media_article') {
    return pickCopyVariant(seed, [
      {
        title: 'Der er gang i snakken \uD83D\uDD25',
        body: 'Se hvad fans snakker om lige nu',
      },
      {
        title: 'FCN i medierne skaber debat',
        body: 'Fansene diskuterer en artikel lige nu',
      },
      {
        title: 'Ny varme i mediesnakken',
        body: '\u00C5bn Hjem og fang debatten om FCN i medierne',
      },
    ]);
  }

  return pickCopyVariant(seed, [
    {
      title: 'Der er gang i snakken \uD83D\uDD25',
      body: 'Se hvad fans snakker om lige nu',
    },
    {
      title: 'Et opslag tager fart',
      body: 'Hop ind og se, hvad FCN-fansene taler om',
    },
    {
      title: 'Fansene er i gang',
      body: 'Der er nyt liv i feedet lige nu',
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

async function fetchActivePushDeviceUserIds(supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from('push_devices')
    .select('user_id')
    .is('invalidated_at', null);

  if (error) throw error;

  return Array.from(
    new Set(
      ((data as { user_id?: string | null }[] | null) ?? [])
        .map((row) => readString(row.user_id))
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );
}

async function enqueueHotPostJob(params: {
  supabase: any;
  recipientUserId: string;
  postId: string;
  title: string;
  body: string;
  dedupeKey: string;
  data: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .rpc('enqueue_notification', {
      p_recipient_user_id: params.recipientUserId,
      p_notification_type: 'hot_post',
      p_title: params.title,
      p_body: params.body,
      p_dedupe_key: params.dedupeKey,
      p_data: params.data,
      p_actor_user_id: null,
      p_preference_key: null,
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

function getProcessCounts(results: HotPostJobResult[]) {
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
    const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

    const { data: posts, error: postError } = await supabase
      .from('posts')
      .select('id, created_at, feed_targets, post_type')
      .in('post_type', ['post', 'media_article'])
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(25);

    if (postError) {
      throw postError;
    }

    const homePosts = (posts ?? []).filter((post: any) => isHomePost(post.feed_targets));
    const postIds = homePosts.map((post: any) => String(post.id));
    if (postIds.length === 0) {
      return json(200, {
        ok: true,
        engine: 'v2',
        postsMatched: 0,
        total: 0,
        queued: 0,
        skipped: 0,
        sent: 0,
        failed: 0,
      });
    }

    const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] =
      await Promise.all([
        supabase
          .from('likes_v2')
          .select('target_id')
          .eq('target_type', 'post')
          .in('target_id', postIds),
        supabase
          .from('comments_v2')
          .select('target_id')
          .eq('target_type', 'post')
          .in('target_id', postIds),
      ]);

    if (likesError) throw likesError;
    if (commentsError) throw commentsError;

    const likeCounts = new Map<string, number>();
    const commentCounts = new Map<string, number>();

    (likes ?? []).forEach((row: any) => {
      const targetId = String(row.target_id);
      likeCounts.set(targetId, (likeCounts.get(targetId) ?? 0) + 1);
    });

    (comments ?? []).forEach((row: any) => {
      const targetId = String(row.target_id);
      commentCounts.set(targetId, (commentCounts.get(targetId) ?? 0) + 1);
    });

    const hotPosts = homePosts
      .map((post: any) => ({
        id: String(post.id),
        postType: normalizeHotPostType(post.post_type),
        likes: likeCounts.get(String(post.id)) ?? 0,
        comments: commentCounts.get(String(post.id)) ?? 0,
      }))
      .filter((post) => post.likes >= MIN_LIKES || post.comments >= MIN_COMMENTS)
      .sort((a, b) => {
        const commentDiff = b.comments - a.comments;
        if (commentDiff !== 0) return commentDiff;
        return b.likes - a.likes;
      })
      .slice(0, MAX_POSTS_PER_RUN);

    const recipientUserIds = await fetchActivePushDeviceUserIds(supabase);
    const jobs: HotPostJobResult[] = [];
    const processResults: ProcessPushQueueResult[] = [];
    const processFailures: { jobIds: string[]; error: string }[] = [];

    for (const post of hotPosts) {
      for (const userId of recipientUserIds) {
        const dedupeKey = buildNotificationDedupeKey('hot_post', post.id, userId);
        const copy = getHotPostCopy(`${post.id}:${userId}`, post.postType);
        const isMediaArticle = post.postType === 'media_article';
        try {
          const enqueueResult = await enqueueHotPostJob({
            supabase,
            recipientUserId: userId,
            postId: post.id,
            dedupeKey,
            title: copy.title,
            body: copy.body,
            data: {
              targetType: isMediaArticle ? 'home_feed' : 'post',
              type: isMediaArticle ? 'home_feed' : 'post',
              notificationType: 'hot_post',
              postId: post.id,
              postType: post.postType,
              url: isMediaArticle ? 'fcnfans://home' : `fcnfans://post/${post.id}`,
            },
          });

          jobs.push({
            recipientUserId: userId,
            postId: post.id,
            jobId: enqueueResult.job_id,
            inserted: enqueueResult.inserted,
            skippedReason: enqueueResult.inserted ? null : 'duplicate',
          });
        } catch (error) {
          console.warn('[push_hot_posts] enqueue failed', {
            postId: post.id,
            recipientUserId: userId,
            error: String(error),
          });
          jobs.push({
            recipientUserId: userId,
            postId: post.id,
            jobId: null,
            inserted: false,
            skippedReason: 'enqueue_failed',
          });
        }
      }
    }

    const insertedJobIds = jobs
      .filter((job): job is HotPostJobResult & { jobId: string } =>
        Boolean(job.inserted && job.jobId),
      )
      .map((job) => job.jobId);

    if (insertedJobIds.length > 0) {
      const jobsById = new Map(
        jobs
          .filter((job): job is HotPostJobResult & { jobId: string } => Boolean(job.jobId))
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
          console.warn('[push_hot_posts] process_push_queue chunk failed after enqueue', {
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
      postsMatched: hotPosts.length,
      recipientsTargeted: recipientUserIds.length,
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
