// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createInAppNotifications,
  createAdminClient,
  dispatchNotifications,
  fetchExistingNotificationDedupeKeys,
  fetchPushPreferencesByUserIds,
  fetchPushTokensForUsers,
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

type PushTokenRow = {
  user_id: string;
  push_token: string;
  platform?: string | null;
  updated_at?: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePushTokens(rows: PushTokenRow[]): PushTokenRow[] {
  return rows.flatMap((row) => {
    const userId = readString(row.user_id);
    const pushToken = readString(row.push_token);
    if (!userId || !pushToken) return [];

    return [
      {
        user_id: userId,
        push_token: pushToken,
        platform: row.platform ?? null,
        updated_at: row.updated_at ?? null,
      },
    ];
  });
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

    const tokens = normalizePushTokens(
      (await fetchPushTokensForUsers(supabase, [recipientUserId])) as PushTokenRow[],
    );

    if (tokens.length === 0) {
      console.log('[push_comment_replies] skipped no token', {
        commentId,
        recipientUserId,
        notificationType,
      });
      return json(200, { ok: true, skipped: 'no_token', recipientUserId, inApp: inAppResult });
    }

    const dedupeKeys = tokens.map((tokenRow) =>
      buildNotificationDedupeKey(
        notificationType,
        comment.id,
        recipientUserId,
        tokenRow.push_token,
      ),
    );
    const existingDedupeKeys = await fetchExistingNotificationDedupeKeys(supabase, dedupeKeys);
    const requests = tokens.flatMap((tokenRow) => {
      const dedupeKey = buildNotificationDedupeKey(
        notificationType,
        comment.id,
        recipientUserId,
        tokenRow.push_token,
      );

      if (existingDedupeKeys.has(dedupeKey)) {
        return [];
      }

      return [
        {
          userId: recipientUserId,
          pushToken: tokenRow.push_token,
          notificationType,
          dedupeKey,
          title:
            notificationType === 'reply_to_comment'
              ? `${senderName} svarede p\u00E5 din kommentar`
              : `${senderName} kommenterede dit opslag`,
          body: bodyPreview,
          data: {
            notificationType,
            targetType: notificationType === 'reply_to_comment' ? 'comment_reply' : 'post_comment',
            type: 'post',
            postId: comment.target_id,
            commentId: comment.id,
            parentCommentId: comment.parent_id,
            url: `fcnfans://post/${comment.target_id}`,
          },
        },
      ];
    });

    if (requests.length === 0) {
      console.log('[push_comment_replies] skipped duplicate', {
        commentId,
        recipientUserId,
        notificationType,
        dedupeKeys,
      });
      return json(200, {
        ok: true,
        skipped: 'duplicate',
        recipientUserId,
        dedupeKeys,
        inApp: inAppResult,
      });
    }

    const result = await dispatchNotifications(supabase, requests);

    console.log('[push_comment_replies] dispatch', {
      commentId,
      notificationType,
      recipientUserId,
      requestsPrepared: requests.length,
      total: result.total,
      queued: result.queued,
      skipped: result.skipped,
      sent: result.sent,
      failed: result.failed,
    });

    return json(200, {
      ok: true,
      commentId,
      notificationType,
      recipientUserId,
      dedupeKeys: requests.map((request) => request.dedupeKey),
      inApp: inAppResult,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
