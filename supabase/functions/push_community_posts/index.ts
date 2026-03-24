// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  dispatchNotifications,
  fetchExistingNotificationDedupeKeys,
  fetchPushTokensForUsers,
  fetchUserIdsWithRecentNotificationTypes,
  getStartOfLocalDayIso,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type RequestBody = {
  postId?: string;
};

type PushTokenRow = {
  user_id: string;
  push_token: string;
  platform?: string | null;
  updated_at?: string | null;
};

type CommunityPostRow = {
  id: string;
  author_id: string;
  actor_type: string | null;
  actor_id: string | null;
  community_id: string | null;
  text: string | null;
  poll_data: Record<string, unknown> | null;
};

const DISCOVERY_NOTIFICATION_TYPES = ['community_post', 'community_poll'];

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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

function truncatePreview(value: string | null | undefined, limit = 120) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
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
      .select('id, author_id, actor_type, actor_id, community_id, text, poll_data')
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

    const tokens = pickLatestTokenPerUser(
      (await fetchPushTokensForUsers(supabase, recipientsAfterSelf)) as PushTokenRow[],
    );
    const tokenUserIds = new Set(tokens.map((tokenRow) => tokenRow.user_id));
    const recipientsSkippedNoToken = recipientsAfterSelf.filter(
      (userId) => !tokenUserIds.has(userId),
    ).length;

    const startOfDayIso = getStartOfLocalDayIso(new Date());
    const cappedUserIds = await fetchUserIdsWithRecentNotificationTypes(supabase, {
      userIds: tokens.map((tokenRow) => tokenRow.user_id),
      notificationTypes: DISCOVERY_NOTIFICATION_TYPES,
      sinceIso: startOfDayIso,
    });

    const isPoll = Boolean(readPollQuestion(post.poll_data));
    const notificationType = isPoll ? 'community_poll' : 'community_post';
    const dedupeKeys = tokens.map((tokenRow) =>
      buildNotificationDedupeKey(notificationType, post.id, tokenRow.user_id),
    );
    const existingDedupeKeys = await fetchExistingNotificationDedupeKeys(supabase, dedupeKeys);

    let recipientsSkippedCap = 0;
    let recipientsSkippedExistingDedupe = 0;
    const requests = tokens.flatMap((tokenRow) => {
      if (cappedUserIds.has(tokenRow.user_id)) {
        recipientsSkippedCap += 1;
        return [];
      }

      const dedupeKey = buildNotificationDedupeKey(notificationType, post.id, tokenRow.user_id);
      if (existingDedupeKeys.has(dedupeKey)) {
        recipientsSkippedExistingDedupe += 1;
        return [];
      }

      return [
        {
          userId: tokenRow.user_id,
          pushToken: tokenRow.push_token,
          notificationType,
          dedupeKey,
          title: isPoll
            ? `${communityName} har lavet en afstemning`
            : `${communityName}: nyt opslag`,
          body: isPoll
            ? truncatePreview(readPollQuestion(post.poll_data))
            : truncatePreview(post.text),
          data: {
            type: 'post',
            postId: post.id,
            communityId,
            isPoll,
            url: `fcnfans://post/${post.id}`,
          },
        },
      ];
    });

    const summary = {
      postId: post.id,
      communityId,
      notificationType,
      recipientsTargeted: tokens.length,
      recipientsSkippedSelf,
      recipientsSkippedNonMembers: 0,
      recipientsSkippedNoToken,
      recipientsSkippedCap,
      recipientsSkippedExistingDedupe,
      requestsPrepared: requests.length,
    };

    if (requests.length === 0) {
      console.log('[push_community_posts] skipped no requests', summary);
      return json(200, { ok: true, skipped: 'no_requests', ...summary });
    }

    const result = await dispatchNotifications(supabase, requests);
    console.log('[push_community_posts] dispatch', {
      ...summary,
      total: result.total,
      queued: result.queued,
      skipped: result.skipped,
      sent: result.sent,
      failed: result.failed,
    });

    return json(200, {
      ok: true,
      ...summary,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
