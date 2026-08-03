// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createInAppNotifications,
  createAdminClient,
  fetchPushPreferencesByUserIds,
  isPushPreferenceEnabled,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type MentionEntityType = 'post' | 'comment' | 'reply';
type MentionNotificationType = 'mention_post' | 'mention_comment' | 'mention_reply';

type MentionPushPayload = {
  actorUserId?: string;
  mentionedUserIds?: string[];
  entityType?: MentionEntityType;
  entityId?: string;
  postId?: string | null;
  commentId?: string | null;
  previewText?: string | null;
};

type CommentEntityRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  target_type: string;
  target_id: string;
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

type MentionJobResult = {
  userId: string;
  jobId: string | null;
  inserted: boolean;
  jobStatus: string | null;
  skipped: boolean;
  process?: ProcessPushQueueResult | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => readString(entry)).filter((entry): entry is string => Boolean(entry));
}

function getNotificationType(entityType: MentionEntityType): MentionNotificationType {
  if (entityType === 'post') return 'mention_post';
  if (entityType === 'reply') return 'mention_reply';
  return 'mention_comment';
}

function getTargetType(entityType: MentionEntityType): 'post' | 'post_comment' {
  return entityType === 'post' ? 'post' : 'post_comment';
}

function getBodyText(entityType: MentionEntityType): string {
  return entityType === 'post' ? 'n\u00E6vnte dig i et opslag' : 'n\u00E6vnte dig i en kommentar';
}

function getBodyTextVariants(entityType: MentionEntityType): string[] {
  if (entityType === 'post') {
    return ['n\u00E6vnte dig i et opslag', 'taggede dig i et nyt opslag', 'trak dig ind i snakken'];
  }

  return [
    'n\u00E6vnte dig i en kommentar',
    'taggede dig i kommentarsporet',
    'trak dig ind i tr\u00E5den',
  ];
}

function pickCopyVariant(seed: string, variants: string[]): string {
  if (variants.length === 0) return '';

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return variants[hash % variants.length] ?? variants[0];
}

function truncatePreview(value: string | null | undefined, limit = 120): string | null {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

async function readRequestBody(req: Request): Promise<MentionPushPayload> {
  try {
    const raw = await req.text();
    if (!raw.trim()) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as MentionPushPayload;
  } catch {
    return {};
  }
}

async function enqueueMentionJob(params: {
  supabase: any;
  recipientUserId: string;
  actorUserId: string;
  notificationType: MentionNotificationType;
  title: string;
  body: string;
  dedupeKey: string;
  data: Record<string, unknown>;
  entityId: string;
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
      p_preference_key: 'mentions',
      p_source_table: 'mentions',
      p_source_id: params.entityId,
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

function getProcessCounts(results: MentionJobResult[]) {
  return results.reduce(
    (acc, result) => {
      const totals = result.process?.totals ?? {};
      const firstJob = Array.isArray(result.process?.jobs) ? result.process?.jobs[0] : null;

      return {
        total: acc.total + (result.inserted ? 1 : 0),
        queued:
          acc.queued +
          (typeof totals.deliveriesCreated === 'number'
            ? totals.deliveriesCreated
            : (firstJob?.deliveriesCreated ?? 0)),
        skipped:
          acc.skipped +
          (result.skipped ? 1 : 0) +
          (typeof totals.skipped === 'number' ? totals.skipped : (firstJob?.skipped ?? 0)),
        sent:
          acc.sent +
          (typeof totals.sentToExpo === 'number' ? totals.sentToExpo : (firstJob?.sentToExpo ?? 0)),
        failed:
          acc.failed +
          (typeof totals.failed === 'number' ? totals.failed : (firstJob?.failed ?? 0)),
      };
    },
    { total: 0, queued: 0, skipped: 0, sent: 0, failed: 0 },
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
    const actorUserId = readString(body.actorUserId);
    const entityId = readString(body.entityId);
    const entityType = readString(body.entityType) as MentionEntityType | null;
    const postId = readString(body.postId ?? null);
    const commentId = readString(body.commentId ?? null);
    const previewText = truncatePreview(body.previewText ?? null);

    if (!actorUserId || !entityId || !entityType) {
      return json(400, { error: 'Missing actorUserId, entityType, or entityId' });
    }

    if (!['post', 'comment', 'reply'].includes(entityType)) {
      return json(400, { error: 'Unsupported entityType' });
    }

    if (actorUserId !== callerUserId) {
      return json(403, { error: 'Only the actor can trigger mention push' });
    }

    const normalizedMentionedUserIds = Array.from(
      new Set(readStringArray(body.mentionedUserIds).filter((userId) => userId !== actorUserId)),
    );

    if (normalizedMentionedUserIds.length === 0) {
      return json(200, { ok: true, skipped: 'no_recipients' });
    }

    let resolvedPostId = entityType === 'post' ? (postId ?? entityId) : postId;
    let resolvedCommentId = commentId;
    let resolvedParentCommentId: string | null = null;
    if (!resolvedPostId) {
      return json(400, { error: 'Missing postId for mention notification' });
    }

    const supabase = createAdminClient();
    if (entityType === 'post') {
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select('id, author_id')
        .eq('id', entityId)
        .maybeSingle();

      if (postError) {
        throw postError;
      }

      if (!postData?.id) {
        return json(404, { error: 'Post not found' });
      }

      if (readString(postData.author_id) !== actorUserId) {
        return json(403, { error: 'Only the post author can trigger mention push' });
      }

      resolvedPostId = postData.id;
    } else {
      const { data: commentData, error: commentError } = await supabase
        .from('comments_v2')
        .select('id, author_id, parent_id, target_type, target_id')
        .eq('id', entityId)
        .maybeSingle();

      if (commentError) {
        throw commentError;
      }

      const entity = (commentData as CommentEntityRow | null) ?? null;
      if (!entity) {
        return json(404, { error: 'Comment not found' });
      }

      if (readString(entity.author_id) !== actorUserId) {
        return json(403, { error: 'Only the comment author can trigger mention push' });
      }

      if (entity.target_type !== 'post') {
        return json(200, {
          ok: true,
          skipped: 'unsupported_target_type',
          targetType: entity.target_type,
        });
      }

      if (entityType === 'reply' && !entity.parent_id) {
        return json(400, { error: 'Entity is not a reply' });
      }

      if (entityType === 'comment' && entity.parent_id) {
        return json(400, { error: 'Entity is not a top-level comment' });
      }

      resolvedPostId = readString(entity.target_id);
      resolvedCommentId = entity.id;
      resolvedParentCommentId = readString(entity.parent_id);
    }

    if (!resolvedPostId) {
      return json(400, { error: 'Could not resolve postId for mention notification' });
    }

    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', actorUserId)
      .maybeSingle();

    const actorName =
      readString(actorProfile?.display_name ?? null) ??
      readString(actorProfile?.username ?? null) ??
      'En fan';

    let inAppResult = { total: 0, created: 0, skipped: 0 };
    try {
      inAppResult = await createInAppNotifications(
        supabase,
        normalizedMentionedUserIds.map((userId) => ({
          userId,
          actorUserId,
          type: 'mention',
          postId: resolvedPostId,
          commentId: resolvedCommentId,
          title: `${actorName} n\u00E6vnte dig`,
          body: previewText ?? getBodyText(entityType),
          dedupeKey: buildNotificationDedupeKey('in_app_mention', entityType, entityId, userId),
        })),
      );
    } catch (error) {
      console.warn('[push_mentions] failed to create in-app notifications', {
        entityType,
        entityId,
        postId: resolvedPostId,
        commentId: resolvedCommentId,
        error: String(error),
      });
    }

    const preferencesByUserId = await fetchPushPreferencesByUserIds(
      supabase,
      normalizedMentionedUserIds,
    );
    const recipientsAfterPreferences = normalizedMentionedUserIds.filter((userId) =>
      isPushPreferenceEnabled(preferencesByUserId, userId, 'mentions'),
    );

    if (recipientsAfterPreferences.length === 0) {
      return json(200, { ok: true, skipped: 'preferences_disabled', inApp: inAppResult });
    }

    const notificationType = getNotificationType(entityType);
    const targetType = getTargetType(entityType);
    const title = pickCopyVariant(`${entityType}:${entityId}:${actorName}`, [
      `${actorName} n\u00E6vnte dig`,
      `${actorName} taggede dig`,
      `Du blev n\u00E6vnt af ${actorName}`,
    ]);
    const pushBody = pickCopyVariant(`${entityType}:${entityId}`, getBodyTextVariants(entityType));
    const pushData = {
      notificationType,
      targetType,
      type: 'post',
      postId: resolvedPostId,
      commentId: resolvedCommentId,
      parentCommentId: resolvedParentCommentId,
      entityType,
      entityId,
      previewText,
      url: `fcnfans://post/${resolvedPostId}`,
    };

    const jobs: MentionJobResult[] = [];
    for (const userId of recipientsAfterPreferences) {
      const dedupeKey = buildNotificationDedupeKey(notificationType, entityId, userId);
      const enqueueResult = await enqueueMentionJob({
        supabase,
        recipientUserId: userId,
        actorUserId,
        notificationType,
        title,
        body: pushBody,
        dedupeKey,
        data: pushData,
        entityId,
      });

      if (!enqueueResult.inserted) {
        jobs.push({
          userId,
          jobId: enqueueResult.job_id,
          inserted: false,
          jobStatus: enqueueResult.job_status,
          skipped: true,
          process: null,
        });
        continue;
      }

      const processResult = await processQueuedJob(enqueueResult.job_id);
      jobs.push({
        userId,
        jobId: enqueueResult.job_id,
        inserted: true,
        jobStatus:
          readString(processResult.jobs?.[0]?.status) ??
          readString(enqueueResult.job_status) ??
          'queued',
        skipped: false,
        process: processResult,
      });
    }

    const counts = getProcessCounts(jobs);
    const insertedJobs = jobs.filter((job) => job.inserted);
    const duplicateJobs = jobs.filter((job) => !job.inserted);

    return json(200, {
      ok: true,
      entityType,
      entityId,
      postId: resolvedPostId,
      commentId: resolvedCommentId,
      recipientsTargeted: recipientsAfterPreferences.length,
      requestsPrepared: insertedJobs.length,
      inApp: inAppResult,
      total: counts.total,
      queued: counts.queued,
      skipped: counts.skipped,
      sent: counts.sent,
      failed: counts.failed,
      ...(insertedJobs.length === 0 && duplicateJobs.length > 0
        ? { skippedReason: 'duplicate' }
        : {}),
      engine: 'v2',
      jobs: jobs.map((job) => ({
        jobId: job.jobId,
        inserted: job.inserted,
        jobStatus: job.jobStatus,
        skipped: job.skipped,
      })),
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
