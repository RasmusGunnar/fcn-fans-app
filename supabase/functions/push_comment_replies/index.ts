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

type RequestBody = {
  commentId?: string;
};

type CommentRow = {
  id: string;
  author_id: string;
  target_type: string;
  target_id: string;
  parent_id: string | null;
  text: string;
  created_at: string;
};

type PostRow = {
  id: string;
  author_id: string | null;
  post_type: string | null;
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

type CommentReplyJobResult = {
  jobId: string | null;
  inserted: boolean;
  jobStatus: string | null;
  skipped: boolean;
  process?: ProcessPushQueueResult | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function truncatePreview(value: string, limit = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Du har f\u00E5et et nyt svar.';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}\u2026`;
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

async function enqueueCommentReplyJob(params: {
  supabase: any;
  recipientUserId: string;
  actorUserId: string;
  notificationType: 'comment_on_post' | 'reply_to_comment';
  title: string;
  body: string;
  dedupeKey: string;
  data: Record<string, unknown>;
  commentId: string;
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
      p_preference_key: 'replies',
      p_source_table: 'comments_v2',
      p_source_id: params.commentId,
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

function getProcessCounts(result: CommentReplyJobResult) {
  const totals = result.process?.totals ?? {};
  const firstJob = Array.isArray(result.process?.jobs) ? result.process.jobs[0] : null;
  const fallbackQueued = result.inserted && !result.process ? 1 : 0;

  return {
    total: result.inserted ? 1 : 0,
    queued:
      typeof totals.deliveriesCreated === 'number'
        ? totals.deliveriesCreated
        : (firstJob?.deliveriesCreated ?? fallbackQueued),
    skipped:
      (result.skipped ? 1 : 0) +
      (typeof totals.skipped === 'number' ? totals.skipped : (firstJob?.skipped ?? 0)),
    sent: typeof totals.sentToExpo === 'number' ? totals.sentToExpo : (firstJob?.sentToExpo ?? 0),
    failed: typeof totals.failed === 'number' ? totals.failed : (firstJob?.failed ?? 0),
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
    const commentId = readString(body.commentId);

    if (!commentId) {
      return json(400, { error: 'Missing commentId' });
    }

    const supabase = createAdminClient();
    const { data: commentData, error: commentError } = await supabase
      .from('comments_v2')
      .select('id, author_id, target_type, target_id, parent_id, text, created_at')
      .eq('id', commentId)
      .maybeSingle();

    if (commentError) {
      throw commentError;
    }

    const comment = (commentData as CommentRow | null) ?? null;
    if (!comment) {
      return json(404, { error: 'Comment not found' });
    }

    if (comment.author_id !== callerUserId) {
      return json(403, { error: 'Only the comment author can trigger reply push' });
    }

    if (comment.target_type !== 'post') {
      console.log('[push_comment_replies] skipped unsupported target type', {
        commentId,
        targetType: comment.target_type,
      });
      return json(200, {
        ok: true,
        skipped: 'unsupported_target_type',
        targetType: comment.target_type,
      });
    }

    const notificationType: 'comment_on_post' | 'reply_to_comment' = comment.parent_id
      ? 'reply_to_comment'
      : 'comment_on_post';

    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, post_type')
      .eq('id', comment.target_id)
      .maybeSingle();

    if (postError) {
      throw postError;
    }

    const post = (postData as PostRow | null) ?? null;
    if (!post?.id) {
      console.log('[push_comment_replies] skipped missing post', {
        commentId,
        notificationType,
        postId: comment.target_id,
      });
      return json(200, { ok: true, skipped: 'missing_post' });
    }

    if (readString(post?.post_type ?? null) === 'media_article') {
      console.log('[push_comment_replies] skipped media article post', {
        commentId,
        notificationType,
        postId: comment.target_id,
      });
      return json(200, { ok: true, skipped: 'media_article_post' });
    }

    let recipientUserId: string | null = null;

    if (comment.parent_id) {
      const { data: parentData, error: parentError } = await supabase
        .from('comments_v2')
        .select('id, author_id')
        .eq('id', comment.parent_id)
        .maybeSingle();

      if (parentError) {
        throw parentError;
      }

      recipientUserId = readString(parentData?.author_id ?? null);
    } else {
      recipientUserId = readString(post?.author_id ?? null);
    }

    if (!recipientUserId) {
      console.log('[push_comment_replies] skipped missing recipient', {
        commentId,
        notificationType,
      });
      return json(200, { ok: true, skipped: 'missing_recipient' });
    }

    if (recipientUserId === callerUserId) {
      console.log('[push_comment_replies] skipped self notify', {
        commentId,
        notificationType,
      });
      return json(200, { ok: true, skipped: 'self_notify' });
    }

    const { data: authorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', callerUserId)
      .maybeSingle();

    const senderName = readString(authorProfile?.display_name ?? null) ?? 'En fan';
    const bodyPreview = truncatePreview(comment.text);
    const inAppTitle =
      notificationType === 'reply_to_comment'
        ? `${senderName} svarede dig`
        : `${senderName} kommenterede dit opslag`;

    let inAppResult = { total: 0, created: 0, skipped: 0 };
    try {
      inAppResult = await createInAppNotifications(supabase, [
        {
          userId: recipientUserId,
          actorUserId: callerUserId,
          type: 'reply',
          postId: comment.target_id,
          commentId: comment.id,
          title: inAppTitle,
          body: bodyPreview,
          dedupeKey: buildNotificationDedupeKey('in_app_reply', comment.id, recipientUserId),
        },
      ]);
    } catch (error) {
      console.warn('[push_comment_replies] failed to create in-app notification', {
        commentId,
        recipientUserId,
        notificationType,
        error: String(error),
      });
    }

    const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, [recipientUserId]);
    if (!isPushPreferenceEnabled(preferencesByUserId, recipientUserId, 'replies')) {
      console.log('[push_comment_replies] skipped preference disabled', {
        commentId,
        recipientUserId,
        notificationType,
      });
      return json(200, {
        ok: true,
        skipped: 'preferences_disabled',
        recipientUserId,
        inApp: inAppResult,
      });
    }

    const dedupeKey = buildNotificationDedupeKey(notificationType, comment.id, recipientUserId);
    const dedupeKeys = [dedupeKey];
    const pushTitle =
      notificationType === 'reply_to_comment'
        ? `${senderName} svarede p\u00E5 din kommentar`
        : `${senderName} kommenterede dit opslag`;
    const pushData = {
      notificationType,
      targetType: notificationType === 'reply_to_comment' ? 'comment_reply' : 'post_comment',
      type: 'post',
      postId: comment.target_id,
      commentId: comment.id,
      parentCommentId: comment.parent_id,
      url: `fcnfans://post/${comment.target_id}`,
    };

    const enqueueResult = await enqueueCommentReplyJob({
      supabase,
      recipientUserId,
      actorUserId: callerUserId,
      notificationType,
      title: pushTitle,
      body: bodyPreview,
      dedupeKey,
      data: pushData,
      commentId: comment.id,
    });

    if (!enqueueResult.inserted) {
      console.log('[push_comment_replies] skipped duplicate', {
        commentId,
        recipientUserId,
        notificationType,
        dedupeKeys,
      });
      return json(200, {
        ok: true,
        skipped: 'duplicate',
        skippedReason: 'duplicate',
        recipientUserId,
        commentId,
        notificationType,
        dedupeKeys,
        inApp: inAppResult,
        total: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        engine: 'v2',
        jobId: enqueueResult.job_id,
        jobStatus: enqueueResult.job_status,
        inserted: false,
      });
    }

    let processResult: ProcessPushQueueResult | null = null;
    let jobStatus = readString(enqueueResult.job_status) ?? 'queued';
    try {
      processResult = await processQueuedJob(enqueueResult.job_id);
      jobStatus =
        readString(processResult.jobs?.[0]?.status) ??
        readString(enqueueResult.job_status) ??
        'queued';
    } catch (error) {
      jobStatus = 'queued';
      console.warn('[push_comment_replies] process_push_queue failed after enqueue', {
        commentId,
        notificationType,
        recipientUserId,
        jobId: enqueueResult.job_id,
        error: String(error),
      });
    }

    const jobResult: CommentReplyJobResult = {
      jobId: enqueueResult.job_id,
      inserted: true,
      jobStatus,
      skipped: false,
      process: processResult,
    };
    const counts = getProcessCounts(jobResult);

    console.log('[push_comment_replies] dispatch', {
      commentId,
      notificationType,
      recipientUserId,
      requestsPrepared: 1,
      engine: 'v2',
      jobId: enqueueResult.job_id,
      jobStatus,
      total: counts.total,
      queued: counts.queued,
      skipped: counts.skipped,
      sent: counts.sent,
      failed: counts.failed,
    });

    return json(200, {
      ok: true,
      commentId,
      notificationType,
      recipientUserId,
      dedupeKeys,
      inApp: inAppResult,
      total: counts.total,
      queued: counts.queued,
      skipped: counts.skipped,
      sent: counts.sent,
      failed: counts.failed,
      engine: 'v2',
      jobId: enqueueResult.job_id,
      jobStatus,
      inserted: true,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
