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

type PushTokenRow = {
  user_id: string;
  push_token: string;
  platform?: string | null;
  updated_at?: string | null;
};

type CommentEntityRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  target_type: string;
  target_id: string;
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

function getIsoTime(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function pickLatestTokenPerUser(rows: PushTokenRow[]): PushTokenRow[] {
  const latestByUser = new Map<string, PushTokenRow>();

  for (const row of rows) {
    const userId = readString(row.user_id);
    const pushToken = readString(row.push_token);
    if (!userId || !pushToken) continue;

    const normalizedRow: PushTokenRow = {
      user_id: userId,
      push_token: pushToken,
      platform: row.platform ?? null,
      updated_at: row.updated_at ?? null,
    };

    const existing = latestByUser.get(userId);
    if (!existing || getIsoTime(normalizedRow.updated_at) >= getIsoTime(existing.updated_at)) {
      latestByUser.set(userId, normalizedRow);
    }
  }

  return Array.from(latestByUser.values());
}

function getNotificationType(entityType: MentionEntityType): MentionNotificationType {
  if (entityType === 'post') return 'mention_post';
  if (entityType === 'reply') return 'mention_reply';
  return 'mention_comment';
}

function getBodyText(entityType: MentionEntityType): string {
  return entityType === 'post' ? 'n\u00E6vnte dig i et opslag' : 'n\u00E6vnte dig i en kommentar';
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

    const tokens = pickLatestTokenPerUser(
      (await fetchPushTokensForUsers(supabase, recipientsAfterPreferences)) as PushTokenRow[],
    );

    if (tokens.length === 0) {
      return json(200, { ok: true, skipped: 'no_token', inApp: inAppResult });
    }

    const notificationType = getNotificationType(entityType);
    const dedupeKeys = tokens.map((tokenRow) =>
      buildNotificationDedupeKey(notificationType, entityId, tokenRow.user_id),
    );
    const existingDedupeKeys = await fetchExistingNotificationDedupeKeys(supabase, dedupeKeys);

    const requests = tokens.flatMap((tokenRow) => {
      const dedupeKey = buildNotificationDedupeKey(notificationType, entityId, tokenRow.user_id);
      if (existingDedupeKeys.has(dedupeKey)) {
        return [];
      }

      return [
        {
          userId: tokenRow.user_id,
          pushToken: tokenRow.push_token,
          notificationType,
          dedupeKey,
          title: `${actorName} n\u00E6vnte dig`,
          body: getBodyText(entityType),
          data: {
            type: 'post',
            postId: resolvedPostId,
            commentId: resolvedCommentId,
            entityType,
            entityId,
            previewText,
            url: `fcnfans://post/${resolvedPostId}`,
          },
        },
      ];
    });

    if (requests.length === 0) {
      return json(200, { ok: true, skipped: 'duplicate', inApp: inAppResult });
    }

    const result = await dispatchNotifications(supabase, requests);
    return json(200, {
      ok: true,
      entityType,
      entityId,
      postId: resolvedPostId,
      commentId: resolvedCommentId,
      recipientsTargeted: tokens.length,
      requestsPrepared: requests.length,
      inApp: inAppResult,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
