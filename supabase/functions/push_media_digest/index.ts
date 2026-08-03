// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  fetchPushPreferencesByUserIds,
  isPushPreferenceEnabled,
  json,
  requireSyncSecret,
} from '../_shared/push.ts';

const COPENHAGEN_TIME_ZONE = 'Europe/Copenhagen';
const DISPATCH_HOUR_CPH = 18;
const FIRST_RUN_LOOKBACK_HOURS = 48;
const QUEUE_BATCH_SIZE = 25;
const ENQUEUE_CONCURRENCY = 8;
const MAX_ARTICLES_PER_DIGEST = 100;
const STALE_RUN_TIMEOUT_MINUTES = 30;

type MediaDigestRequest = {
  dryRun?: unknown;
  nowIso?: unknown;
  targetUserIds?: unknown;
};

type MediaArticle = {
  id: string;
  created_at: string;
  feed_targets: string[] | null;
};

type EnqueueNotificationResult = {
  job_id: string;
  inserted: boolean;
  job_status: string;
  skip_reason: string | null;
};

type DigestJob = {
  userId: string;
  jobId: string | null;
  inserted: boolean;
  duplicate: boolean;
  error: string | null;
};

type DigestRunRow = {
  id: string;
  status: string;
  started_at: string;
  attempt_count: number;
  article_count?: number;
  jobs_enqueued?: number;
  recipients_count?: number;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(readString).filter((entry): entry is string => Boolean(entry))),
  );
}

function readPositiveInteger(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isHomeArticle(article: MediaArticle): boolean {
  return (
    !Array.isArray(article.feed_targets) ||
    article.feed_targets.length === 0 ||
    article.feed_targets.includes('home')
  );
}

function getCopenhagenParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: COPENHAGEN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
  };
}

function getDigestSignature(articleIds: string[]): string {
  const input = [...articleIds].sort().join(':');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function readRequest(req: Request): Promise<MediaDigestRequest> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as MediaDigestRequest)
      : {};
  } catch {
    return {};
  }
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

async function fetchCandidateArticles(supabase: any, now: Date): Promise<MediaArticle[]> {
  const { data: latestRun, error: latestRunError } = await supabase
    .from('notification_digest_runs')
    .select('last_article_created_at, completed_at')
    .eq('digest_type', 'media_digest')
    .eq('status', 'completed')
    .order('cph_day', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestRunError) throw latestRunError;

  const sinceIso =
    readString(latestRun?.last_article_created_at) ??
    readString(latestRun?.completed_at) ??
    new Date(now.getTime() - FIRST_RUN_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('posts')
    .select('id, created_at, feed_targets')
    .eq('post_type', 'media_article')
    .gte('created_at', sinceIso)
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_ARTICLES_PER_DIGEST);
  if (error) throw error;

  const articles = ((data as MediaArticle[] | null) ?? []).filter(isHomeArticle);
  if (articles.length === 0) return [];

  const { data: includedRows, error: includedError } = await supabase
    .from('notification_digest_articles')
    .select('article_id')
    .eq('digest_type', 'media_digest')
    .in(
      'article_id',
      articles.map((article) => article.id),
    );
  if (includedError) throw includedError;

  const includedIds = new Set(
    ((includedRows as { article_id?: string | null }[] | null) ?? [])
      .map((row) => readString(row.article_id))
      .filter((articleId): articleId is string => Boolean(articleId)),
  );
  return articles.filter((article) => !includedIds.has(article.id));
}

async function claimRun(supabase: any, cphDay: string) {
  const claimNow = new Date();
  const nowIso = claimNow.toISOString();
  const staleBeforeIso = new Date(
    claimNow.getTime() - STALE_RUN_TIMEOUT_MINUTES * 60 * 1000,
  ).toISOString();
  const runColumns =
    'id, status, started_at, attempt_count, article_count, jobs_enqueued, recipients_count';
  const { data: inserted, error: insertError } = await supabase
    .from('notification_digest_runs')
    .insert({
      digest_type: 'media_digest',
      cph_day: cphDay,
      status: 'processing',
      started_at: nowIso,
      attempt_count: 1,
      completed_at: null,
      error_message: null,
    })
    .select(runColumns)
    .maybeSingle();

  if (!insertError && inserted) {
    return { run: inserted as DigestRunRow, claimed: true, reclaimed: false };
  }
  if (insertError?.code !== '23505') throw insertError;

  const { data: existing, error: existingError } = await supabase
    .from('notification_digest_runs')
    .select(runColumns)
    .eq('digest_type', 'media_digest')
    .eq('cph_day', cphDay)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('Digest run conflict found without an existing run');

  const existingRun = existing as DigestRunRow;
  const isFailedRetry = existingRun.status === 'failed';
  const existingStartedAtMs = Date.parse(existingRun.started_at);
  const isStaleProcessingRun =
    existingRun.status === 'processing' &&
    Number.isFinite(existingStartedAtMs) &&
    existingStartedAtMs <= Date.parse(staleBeforeIso);

  if (isFailedRetry || isStaleProcessingRun) {
    const reclaimMessage = isStaleProcessingRun
      ? `Reclaimed stale processing run from ${existingRun.started_at}`
      : null;
    const { data: retried, error: retryError } = await supabase
      .from('notification_digest_runs')
      .update({
        status: 'processing',
        started_at: nowIso,
        attempt_count: readPositiveInteger(existingRun.attempt_count) + 1,
        completed_at: null,
        error_message: reclaimMessage,
      })
      .eq('id', existingRun.id)
      .eq('status', existingRun.status)
      .eq('started_at', existingRun.started_at)
      .select(runColumns)
      .maybeSingle();
    if (retryError) throw retryError;
    if (retried) {
      return {
        run: retried as DigestRunRow,
        claimed: true,
        reclaimed: isStaleProcessingRun,
      };
    }

    const { data: current, error: currentError } = await supabase
      .from('notification_digest_runs')
      .select(runColumns)
      .eq('id', existingRun.id)
      .maybeSingle();
    if (currentError) throw currentError;
    return {
      run: (current ?? existingRun) as DigestRunRow,
      claimed: false,
      reclaimed: false,
    };
  }

  return { run: existingRun, claimed: false, reclaimed: false };
}

async function updateClaimedRun(params: {
  supabase: any;
  runId: string;
  startedAt: string;
  patch: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .from('notification_digest_runs')
    .update(params.patch)
    .eq('id', params.runId)
    .eq('status', 'processing')
    .eq('started_at', params.startedAt)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Media digest run lease was lost');
}

async function completeClaimedRun(params: {
  supabase: any;
  runId: string;
  startedAt: string;
  articles: MediaArticle[];
  recipientsCount: number;
  jobsEnqueued: number;
}) {
  const newestArticle = params.articles[params.articles.length - 1];
  if (!newestArticle) throw new Error('Cannot complete a digest without articles');

  const { data, error } = await params.supabase.rpc('complete_media_digest_run', {
    p_run_id: params.runId,
    p_started_at: params.startedAt,
    p_article_ids: params.articles.map((article) => article.id),
    p_recipients_count: params.recipientsCount,
    p_jobs_enqueued: params.jobsEnqueued,
    p_last_article_created_at: newestArticle.created_at,
    p_last_article_id: newestArticle.id,
  });
  if (error) throw error;
  if (data !== true) throw new Error('Media digest run lease was lost before completion');
}

async function processJobIds(jobIds: string[]) {
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
    body: JSON.stringify({ jobIds, limit: QUEUE_BATCH_SIZE }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error(
      `process_push_queue failed with ${response.status}: ${JSON.stringify(result ?? {})}`,
    );
  }
  return result;
}

async function enqueueDigestJob(params: {
  supabase: any;
  userId: string;
  articleSignature: string;
  articleCount: number;
  newestArticle: MediaArticle;
  title: string;
  body: string;
}): Promise<DigestJob> {
  const dedupeKey = buildNotificationDedupeKey(
    'media_digest',
    params.articleSignature,
    params.userId,
  );

  try {
    const { data, error } = await params.supabase
      .rpc('enqueue_notification', {
        p_recipient_user_id: params.userId,
        p_notification_type: 'media_digest',
        p_title: params.title,
        p_body: params.body,
        p_dedupe_key: dedupeKey,
        p_data: {
          targetType: 'home_feed',
          type: 'home_feed',
          notificationType: 'media_digest',
          postId: params.newestArticle.id,
          feedItemType: 'media_article',
          articleCount: params.articleCount,
          url: `fcnfans://home?focusPostId=${params.newestArticle.id}&feedItemType=media_article`,
        },
        p_actor_user_id: null,
        p_preference_key: 'media_digest',
        p_source_table: 'posts',
        p_source_id: params.newestArticle.id,
        p_next_attempt_at: new Date().toISOString(),
        p_max_attempts: 5,
      })
      .single();
    if (error) throw error;

    const result = data as EnqueueNotificationResult;
    return {
      userId: params.userId,
      jobId: result.job_id,
      inserted: result.inserted,
      duplicate: !result.inserted,
      error: null,
    };
  } catch (error) {
    return {
      userId: params.userId,
      jobId: null,
      inserted: false,
      duplicate: false,
      error: String(error),
    };
  }
}

Deno.serve(async (req) => {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  const request = await readRequest(req);
  const dryRun = request.dryRun === true;
  const targetUserIds = readStringArray(request.targetUserIds);
  const nowOverride = readString(request.nowIso);
  const manualMode = dryRun || targetUserIds.length > 0 || Boolean(nowOverride);

  if (manualMode && !dryRun && targetUserIds.length === 0) {
    return json(400, {
      error: 'Manual media digest runs must include targetUserIds or use dryRun.',
    });
  }

  const now = nowOverride ? new Date(nowOverride) : new Date();
  if (!Number.isFinite(now.getTime())) {
    return json(400, { error: 'Invalid nowIso' });
  }

  const cph = getCopenhagenParts(now);
  if (!manualMode && cph.hour !== DISPATCH_HOUR_CPH) {
    return json(200, {
      ok: true,
      engine: 'v2',
      digestRunStatus: 'outside_dispatch_hour',
      cphDay: cph.day,
      cphHour: cph.hour,
      candidateArticleCount: 0,
      recipients: 0,
      insertedJobs: 0,
      duplicates: 0,
      skipped: 1,
      processed: 0,
      unprocessed: 0,
      unprocessedJobIds: [],
      processFailures: [],
    });
  }

  const supabase = createAdminClient();
  let runId: string | null = null;
  let runStartedAt: string | null = null;
  let runAttempt: number | null = null;
  let reclaimedRun = false;

  try {
    const articles = await fetchCandidateArticles(supabase, now);
    const sourceUserIds =
      targetUserIds.length > 0 ? targetUserIds : await fetchActivePushDeviceUserIds(supabase);
    const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, sourceUserIds);
    const recipientUserIds = sourceUserIds.filter((userId) =>
      isPushPreferenceEnabled(preferencesByUserId, userId, 'media_digest'),
    );
    const preferenceSkips = sourceUserIds.length - recipientUserIds.length;

    const baseSummary = {
      cphDay: cph.day,
      cphHour: cph.hour,
      dryRun,
      testMode: targetUserIds.length > 0,
      candidateArticleCount: articles.length,
      recipients: recipientUserIds.length,
      preferenceSkips,
    };

    if (dryRun) {
      return json(200, {
        ok: true,
        engine: 'v2',
        ...baseSummary,
        insertedJobs: 0,
        duplicates: 0,
        skipped: preferenceSkips,
        processed: 0,
        unprocessed: 0,
        unprocessedJobIds: [],
        processFailures: [],
        digestRunStatus: 'dry_run',
        articleIds: articles.map((article) => article.id),
      });
    }

    if (targetUserIds.length === 0) {
      const claim = await claimRun(supabase, cph.day);
      runId = readString(claim.run?.id);
      runStartedAt = readString(claim.run?.started_at);
      runAttempt = readPositiveInteger(claim.run?.attempt_count);
      reclaimedRun = claim.reclaimed;
      if (!claim.claimed) {
        return json(200, {
          ok: true,
          engine: 'v2',
          ...baseSummary,
          insertedJobs: 0,
          duplicates: 0,
          skipped: 1 + preferenceSkips,
          processed: 0,
          unprocessed: 0,
          unprocessedJobIds: [],
          processFailures: [],
          digestRunId: runId,
          digestRunAttempt: runAttempt,
          reclaimedRun: false,
          digestRunStatus: claim.run?.status ?? 'already_claimed',
        });
      }
      if (!runId || !runStartedAt) {
        throw new Error('Claimed media digest run is missing its lease metadata');
      }
    }

    if (articles.length === 0 || recipientUserIds.length === 0) {
      const status = 'skipped';
      if (runId && runStartedAt) {
        await updateClaimedRun({
          supabase,
          runId,
          startedAt: runStartedAt,
          patch: {
            status,
            article_count: articles.length,
            recipients_count: recipientUserIds.length,
            jobs_enqueued: 0,
            completed_at: new Date().toISOString(),
            error_message: articles.length === 0 ? null : 'No eligible recipients',
          },
        });
      }

      return json(200, {
        ok: true,
        engine: 'v2',
        ...baseSummary,
        insertedJobs: 0,
        duplicates: 0,
        skipped: 1 + preferenceSkips,
        processed: 0,
        unprocessed: 0,
        unprocessedJobIds: [],
        processFailures: [],
        digestRunId: runId,
        digestRunAttempt: runAttempt,
        reclaimedRun,
        digestRunStatus: status,
      });
    }

    const newestArticle = articles[articles.length - 1];
    const articleSignature = getDigestSignature(articles.map((article) => article.id));
    const articleCount = articles.length;
    const title = 'FCN i medierne';
    const body =
      articleCount === 1
        ? 'Der er en ny FCN-historie i appen'
        : `Der er ${articleCount} nye FCN-historier i appen`;
    const jobs: DigestJob[] = [];

    for (const recipientChunk of chunk(recipientUserIds, ENQUEUE_CONCURRENCY)) {
      const chunkJobs = await Promise.all(
        recipientChunk.map((userId) =>
          enqueueDigestJob({
            supabase,
            userId,
            articleSignature,
            articleCount,
            newestArticle,
            title,
            body,
          }),
        ),
      );
      jobs.push(...chunkJobs);
    }

    const insertedJobIds = jobs
      .filter((job): job is DigestJob & { jobId: string } => Boolean(job.inserted && job.jobId))
      .map((job) => job.jobId);
    const duplicateCount = jobs.filter((job) => job.duplicate).length;
    const enqueueFailures = jobs.filter((job) => job.error).length;
    const processResults: any[] = [];
    const processFailures: { jobIds: string[]; error: string }[] = [];

    for (const jobIdChunk of chunk(insertedJobIds, QUEUE_BATCH_SIZE)) {
      try {
        processResults.push(await processJobIds(jobIdChunk));
      } catch (error) {
        processFailures.push({ jobIds: jobIdChunk, error: String(error) });
        console.warn('[push_media_digest] queue processing failed after enqueue', {
          jobIds: jobIdChunk,
          error: String(error),
        });
      }
    }

    const acknowledgedJobIds = new Set(
      processResults.flatMap((result) => [
        ...(result.claimedJobIds ?? []),
        ...(result.notClaimableJobIds ?? []),
      ]),
    );
    const unprocessedJobIds = insertedJobIds.filter((jobId) => !acknowledgedJobIds.has(jobId));
    const processed = insertedJobIds.length - unprocessedJobIds.length;
    const unprocessed = unprocessedJobIds.length;

    if (enqueueFailures > 0) {
      if (runId && runStartedAt) {
        await updateClaimedRun({
          supabase,
          runId,
          startedAt: runStartedAt,
          patch: {
            status: 'failed',
            article_count: articleCount,
            recipients_count: recipientUserIds.length,
            jobs_enqueued: insertedJobIds.length,
            completed_at: new Date().toISOString(),
            error_message: `${enqueueFailures} notification jobs failed to enqueue`,
          },
        });
      }

      return json(200, {
        ok: false,
        engine: 'v2',
        ...baseSummary,
        insertedJobs: insertedJobIds.length,
        duplicates: duplicateCount,
        skipped: preferenceSkips,
        enqueueFailures,
        processed,
        unprocessed,
        unprocessedJobIds,
        processFailures,
        digestRunId: runId,
        digestRunAttempt: runAttempt,
        reclaimedRun,
        digestRunStatus: 'failed',
      });
    }

    if (runId && runStartedAt) {
      await completeClaimedRun({
        supabase,
        runId,
        startedAt: runStartedAt,
        articles,
        recipientsCount: recipientUserIds.length,
        jobsEnqueued: insertedJobIds.length,
      });
    }

    return json(200, {
      ok: true,
      engine: 'v2',
      ...baseSummary,
      insertedJobs: insertedJobIds.length,
      duplicates: duplicateCount,
      skipped: preferenceSkips + duplicateCount,
      enqueueFailures: 0,
      processed,
      unprocessed,
      unprocessedJobIds,
      processFailures,
      digestRunId: runId,
      digestRunAttempt: runAttempt,
      reclaimedRun,
      digestRunStatus: runId ? 'completed' : 'test_completed',
    });
  } catch (error) {
    let digestRunStatus = runId ? 'lease_lost' : 'not_started';
    if (runId && runStartedAt) {
      try {
        await updateClaimedRun({
          supabase,
          runId,
          startedAt: runStartedAt,
          patch: {
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: String(error).slice(0, 1000),
          },
        });
        digestRunStatus = 'failed';
      } catch (runUpdateError) {
        console.warn('[push_media_digest] could not fail current run lease', {
          runId,
          error: String(runUpdateError),
        });
      }
    }
    return json(500, {
      error: String(error),
      digestRunId: runId,
      digestRunAttempt: runAttempt,
      reclaimedRun,
      digestRunStatus,
    });
  }
});
