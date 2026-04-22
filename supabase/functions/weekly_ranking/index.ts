import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  createAdminClient,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type PostRow = {
  id: string;
  author_id: string;
  created_at: string;
};

type CommentRow = {
  id: string;
  author_id: string;
  target_type: string;
  target_id: string;
  created_at: string;
};

type ContentAuthorRow = {
  id: string;
  author_id: string | null;
};

type LikeRow = {
  user_id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  created_at: string;
};

type MatchCheckInRow = {
  match_id: string;
  user_id: string;
  created_at: string;
};

type FixtureRow = {
  id: string;
  home_team: string | null;
  away_team: string | null;
};

type LeaderboardEntry = {
  user_id: string;
  score: number;
  latest_activity_at: string | null;
};

type WeeklyRankingRequest = {
  userId?: string | null;
};

type QueryFailure = {
  code?: string;
  message?: string;
};

const COPENHAGEN_TIMEZONE = 'Europe/Copenhagen';
const POST_SCORE = 8;
const COMMENT_SCORE = 2;
const LIKE_RECEIVED_SCORE = 1;
const HOME_CHECKIN_SCORE = 10;
const AWAY_CHECKIN_SCORE = 18;
const DAILY_POST_CAP = 2;
const DAILY_COMMENT_CAP = 10;
const COMMENT_TARGET_24H_CAP = 3;
const DAILY_RECEIVED_LIKES_CAP = 20;
const POST_RECEIVED_LIKES_CAP = 5;
const COMMENT_RECEIVED_LIKES_CAP = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isMissingRelation(error: QueryFailure | null | undefined): boolean {
  const message = error?.message?.toLowerCase() || '';
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

async function readRequest(req: Request): Promise<WeeklyRankingRequest | null> {
  try {
    return (await req.json()) as WeeklyRankingRequest;
  } catch {
    return null;
  }
}

function readFormatterParts(
  date: Date,
  timeZone: string,
): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = readFormatterParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone,
}: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  timeZone: string;
}): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const initialOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let candidate = new Date(utcGuess - initialOffset);
  const correctedOffset = getTimeZoneOffsetMs(candidate, timeZone);

  if (correctedOffset !== initialOffset) {
    candidate = new Date(utcGuess - correctedOffset);
  }

  return candidate;
}

function getCurrentWeekWindow(now: Date) {
  const currentParts = readFormatterParts(now, COPENHAGEN_TIMEZONE);
  const weekday = currentParts.weekday;
  const weekdayIndex =
    {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    }[weekday] ?? 0;

  const localDate = new Date(
    Date.UTC(
      Number(currentParts.year),
      Number(currentParts.month) - 1,
      Number(currentParts.day),
    ),
  );
  localDate.setUTCDate(localDate.getUTCDate() - weekdayIndex);

  const weekStartYear = localDate.getUTCFullYear();
  const weekStartMonth = localDate.getUTCMonth() + 1;
  const weekStartDay = localDate.getUTCDate();
  const weekStartDate = `${String(weekStartYear)}-${String(weekStartMonth).padStart(2, '0')}-${String(
    weekStartDay,
  ).padStart(2, '0')}`;

  const weekStartUtc = zonedDateTimeToUtc({
    year: weekStartYear,
    month: weekStartMonth,
    day: weekStartDay,
    timeZone: COPENHAGEN_TIMEZONE,
  });

  return {
    weekStartDate,
    weekStartIso: weekStartUtc.toISOString(),
  };
}

async function loadCommentRows(
  adminClient: ReturnType<typeof createClient>,
  weekStartIso: string,
): Promise<{ data: CommentRow[] | null; error: QueryFailure | null }> {
  const commentsV2Response = await adminClient
    .from('comments_v2')
    .select('id, author_id, target_type, target_id, created_at')
    .gte('created_at', weekStartIso);

  if (!commentsV2Response.error) {
    console.log('[weekly_ranking] using comments_v2');
    return {
      data: (commentsV2Response.data || []) as CommentRow[],
      error: null,
    };
  }

  if (!isMissingRelation(commentsV2Response.error)) {
    return {
      data: null,
      error: commentsV2Response.error,
    };
  }

  console.log('[weekly_ranking] comments_v2 missing, falling back to comments');

  const commentsResponse = await adminClient
    .from('comments')
    .select('id, author_id, post_id, created_at')
    .gte('created_at', weekStartIso);

  if (commentsResponse.error) {
    return {
      data: null,
      error: commentsResponse.error,
    };
  }

  return {
    data: ((commentsResponse.data || []) as Array<{
      id: string;
      author_id: string;
      post_id: string;
      created_at: string;
    }>).map((comment) => ({
      id: comment.id,
      author_id: comment.author_id,
      target_type: 'post',
      target_id: comment.post_id,
      created_at: comment.created_at,
    })),
    error: null,
  };
}

async function loadCommentAuthorRows(
  adminClient: ReturnType<typeof createClient>,
  commentIds: string[],
): Promise<{ data: ContentAuthorRow[] | null; error: QueryFailure | null }> {
  if (commentIds.length === 0) {
    return { data: [], error: null };
  }

  const commentsV2Response = await adminClient
    .from('comments_v2')
    .select('id, author_id')
    .in('id', commentIds);

  if (!commentsV2Response.error) {
    return {
      data: (commentsV2Response.data || []) as ContentAuthorRow[],
      error: null,
    };
  }

  if (!isMissingRelation(commentsV2Response.error)) {
    return {
      data: null,
      error: commentsV2Response.error,
    };
  }

  const commentsResponse = await adminClient
    .from('comments')
    .select('id, author_id')
    .in('id', commentIds);

  return {
    data: (commentsResponse.data || []) as ContentAuthorRow[],
    error: commentsResponse.error,
  };
}

function getCopenhagenDateKey(value: string): string {
  const parts = readFormatterParts(new Date(value), COPENHAGEN_TIMEZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeTeamName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a');
}

function isFcnHomeFixture(fixture: FixtureRow | null | undefined): boolean {
  const homeName = normalizeTeamName(fixture?.home_team)
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a');
  return FCN_TEAM_NAME_MATCHERS.some((matcher) => homeName.includes(matcher));
}

function isFcnAwayFixture(fixture: FixtureRow | null | undefined): boolean {
  const awayName = normalizeTeamName(fixture?.away_team)
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a');
  return FCN_TEAM_NAME_MATCHERS.some((matcher) => awayName.includes(matcher));
}

function sortRowsByCreatedAtAsc<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

serve(async (req) => {
  try {
    const requestData = await readRequest(req);
    const auth = await requireAuthenticatedUser(req);
    if (auth.response) {
      return auth.response;
    }

    const userId = typeof auth.user?.id === 'string' && auth.user.id.trim().length > 0
      ? auth.user.id.trim()
      : null;

    console.log('[weekly_ranking] request context', {
      authUserId: userId,
      requestedUserId:
        typeof requestData?.userId === 'string' && requestData.userId.trim().length > 0
          ? requestData.userId.trim()
          : null,
    });

    if (!userId) {
      console.log('[weekly_ranking] missing authenticated user');
      return json(401, { error: 'Missing authenticated user' });
    }

    const adminClient = createAdminClient();

    const { weekStartDate, weekStartIso } = getCurrentWeekWindow(new Date());
    console.log('[weekly_ranking] query window', { userId, weekStartDate, weekStartIso });

    const [postsResponse, commentsResponse, checkinsResponse, likesResponse] = await Promise.all([
      adminClient
        .from('posts')
        .select('id, author_id, created_at')
        .gte('created_at', weekStartIso),
      loadCommentRows(adminClient, weekStartIso),
      adminClient
        .from('match_checkins')
        .select('match_id, user_id, created_at')
        .gte('created_at', weekStartIso),
      adminClient
        .from('likes_v2')
        .select('user_id, target_type, target_id, created_at')
        .gte('created_at', weekStartIso)
        .in('target_type', ['post', 'comment']),
    ]);

    if (postsResponse.error) {
      console.log('[weekly_ranking] posts query failed', postsResponse.error.message);
      return json(500, {
        error: 'Failed to load weekly ranking',
        details: postsResponse.error.message,
      });
    }
    if (commentsResponse.error) {
      console.log('[weekly_ranking] comments query failed', commentsResponse.error.message);
      return json(500, {
        error: 'Failed to load weekly ranking',
        details: commentsResponse.error.message,
      });
    }
    if (checkinsResponse.error) {
      console.log('[weekly_ranking] checkins query failed', checkinsResponse.error.message);
      return json(500, {
        error: 'Failed to load weekly ranking',
        details: checkinsResponse.error.message,
      });
    }
    if (likesResponse.error) {
      console.log('[weekly_ranking] likes query failed', likesResponse.error.message);
      return json(500, {
        error: 'Failed to load weekly ranking',
        details: likesResponse.error.message,
      });
    }

    console.log('[weekly_ranking] query counts', {
      posts: (postsResponse.data || []).length,
      comments: (commentsResponse.data || []).length,
      checkins: (checkinsResponse.data || []).length,
      likes: (likesResponse.data || []).length,
    });

    const likes = (likesResponse.data || []) as LikeRow[];
    const likedPostIds = Array.from(
      new Set(likes.filter((like) => like.target_type === 'post').map((like) => like.target_id)),
    );
    const likedCommentIds = Array.from(
      new Set(
        likes.filter((like) => like.target_type === 'comment').map((like) => like.target_id),
      ),
    );
    const checkinMatchIds = Array.from(
      new Set(
        ((checkinsResponse.data || []) as MatchCheckInRow[])
          .map((checkin) => checkin.match_id)
          .filter(Boolean),
      ),
    );

    const [likedPostsResponse, likedCommentsResponse, fixturesResponse] = await Promise.all([
      likedPostIds.length > 0
        ? adminClient.from('posts').select('id, author_id').in('id', likedPostIds)
        : Promise.resolve({ data: [], error: null }),
      loadCommentAuthorRows(adminClient, likedCommentIds),
      checkinMatchIds.length > 0
        ? adminClient.from('fixtures').select('id, home_team, away_team').in('id', checkinMatchIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (likedPostsResponse.error) {
      console.log('[weekly_ranking] liked posts query failed', likedPostsResponse.error.message);
      return json(500, {
        error: 'Failed to load weekly ranking',
        details: likedPostsResponse.error.message,
      });
    }
    if (likedCommentsResponse.error) {
      console.log(
        '[weekly_ranking] liked comments query failed',
        likedCommentsResponse.error.message,
      );
      return json(500, {
        error: 'Failed to load weekly ranking',
        details: likedCommentsResponse.error.message,
      });
    }
    if (fixturesResponse.error) {
      console.log('[weekly_ranking] fixtures query failed', fixturesResponse.error.message);
      return json(500, {
        error: 'Failed to load weekly ranking',
        details: fixturesResponse.error.message,
      });
    }

    const scores: Record<string, number> = {};
    const latestActivityAt: Record<string, string> = {};

    const addScore = (userId: string | null | undefined, value: number, createdAt: string) => {
      if (!userId) return;

      scores[userId] = (scores[userId] || 0) + value;
      if (!latestActivityAt[userId] || latestActivityAt[userId] < createdAt) {
        latestActivityAt[userId] = createdAt;
      }
    };

    const postAuthorById = new Map<string, string>();
    ((postsResponse.data || []) as PostRow[]).forEach((post) => {
      if (post.id && post.author_id) {
        postAuthorById.set(post.id, post.author_id);
      }
    });

    const commentAuthorById = new Map<string, string>();
    ((commentsResponse.data || []) as CommentRow[]).forEach((comment) => {
      if (comment.id && comment.author_id) {
        commentAuthorById.set(comment.id, comment.author_id);
      }
    });

    ((likedPostsResponse.data || []) as ContentAuthorRow[]).forEach((post) => {
      if (post.id && post.author_id) {
        postAuthorById.set(post.id, post.author_id);
      }
    });

    ((likedCommentsResponse.data || []) as ContentAuthorRow[]).forEach((comment) => {
      if (comment.id && comment.author_id) {
        commentAuthorById.set(comment.id, comment.author_id);
      }
    });

    const fixturesById = new Map<string, FixtureRow>();
    ((fixturesResponse.data || []) as FixtureRow[]).forEach((fixture) => {
      fixturesById.set(fixture.id, fixture);
    });

    const acceptedPostsPerUserDay = new Map<string, number>();
    sortRowsByCreatedAtAsc((postsResponse.data || []) as PostRow[]).forEach((post) => {
      const dayKey = getCopenhagenDateKey(post.created_at);
      const userDayKey = `${post.author_id}:${dayKey}`;
      const acceptedCount = acceptedPostsPerUserDay.get(userDayKey) || 0;

      if (acceptedCount >= DAILY_POST_CAP) {
        return;
      }

      acceptedPostsPerUserDay.set(userDayKey, acceptedCount + 1);
      addScore(post.author_id, POST_SCORE, post.created_at);
    });

    const acceptedCommentsPerUserDay = new Map<string, number>();
    const acceptedCommentTimestampsByUserTarget = new Map<string, number[]>();
    sortRowsByCreatedAtAsc((commentsResponse.data || []) as CommentRow[]).forEach((comment) => {
      const createdAtMs = new Date(comment.created_at).getTime();
      const dayKey = getCopenhagenDateKey(comment.created_at);
      const userDayKey = `${comment.author_id}:${dayKey}`;
      const userTargetKey = `${comment.author_id}:${comment.target_type}:${comment.target_id}`;
      const acceptedForDay = acceptedCommentsPerUserDay.get(userDayKey) || 0;

      if (acceptedForDay >= DAILY_COMMENT_CAP) {
        return;
      }

      const recentAccepted = (acceptedCommentTimestampsByUserTarget.get(userTargetKey) || []).filter(
        (timestamp) => createdAtMs - timestamp < ONE_DAY_MS,
      );

      if (recentAccepted.length >= COMMENT_TARGET_24H_CAP) {
        acceptedCommentTimestampsByUserTarget.set(userTargetKey, recentAccepted);
        return;
      }

      recentAccepted.push(createdAtMs);
      acceptedCommentTimestampsByUserTarget.set(userTargetKey, recentAccepted);
      acceptedCommentsPerUserDay.set(userDayKey, acceptedForDay + 1);
      addScore(comment.author_id, COMMENT_SCORE, comment.created_at);
    });

    const acceptedReceivedLikesPerUserDay = new Map<string, number>();
    const acceptedReceivedLikesPerTarget = new Map<string, number>();
    sortRowsByCreatedAtAsc(likes).forEach((like) => {
      const targetAuthorId =
        like.target_type === 'post'
          ? postAuthorById.get(like.target_id)
          : commentAuthorById.get(like.target_id);

      if (!targetAuthorId || targetAuthorId === like.user_id) {
        return;
      }

      const dayKey = getCopenhagenDateKey(like.created_at);
      const userDayKey = `${targetAuthorId}:${dayKey}`;
      const targetKey = `${like.target_type}:${like.target_id}`;
      const acceptedForDay = acceptedReceivedLikesPerUserDay.get(userDayKey) || 0;
      const acceptedForTarget = acceptedReceivedLikesPerTarget.get(targetKey) || 0;
      const perTargetCap =
        like.target_type === 'post' ? POST_RECEIVED_LIKES_CAP : COMMENT_RECEIVED_LIKES_CAP;

      if (acceptedForDay >= DAILY_RECEIVED_LIKES_CAP || acceptedForTarget >= perTargetCap) {
        return;
      }

      acceptedReceivedLikesPerUserDay.set(userDayKey, acceptedForDay + 1);
      acceptedReceivedLikesPerTarget.set(targetKey, acceptedForTarget + 1);
      addScore(targetAuthorId, LIKE_RECEIVED_SCORE, like.created_at);
    });

    const acceptedCheckIns = new Set<string>();
    sortRowsByCreatedAtAsc((checkinsResponse.data || []) as MatchCheckInRow[]).forEach((checkin) => {
      const uniqueCheckInKey = `${checkin.user_id}:${checkin.match_id}`;
      if (acceptedCheckIns.has(uniqueCheckInKey)) {
        return;
      }

      acceptedCheckIns.add(uniqueCheckInKey);

      const fixture = fixturesById.get(checkin.match_id);
      const points = isFcnAwayFixture(fixture)
        ? AWAY_CHECKIN_SCORE
        : HOME_CHECKIN_SCORE;

      addScore(checkin.user_id, points, checkin.created_at);
    });

    const leaderboard = Object.entries(scores)
      .map(([user_id, score]) => ({
        user_id,
        score,
        latest_activity_at: latestActivityAt[user_id] || null,
      }))
      .sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
        return (
          b.score - a.score ||
          new Date(b.latest_activity_at || 0).getTime() -
            new Date(a.latest_activity_at || 0).getTime() ||
          a.user_id.localeCompare(b.user_id)
        );
      });

    const rankIndex = leaderboard.findIndex((entry) => entry.user_id === userId);
    console.log('[weekly_ranking] success', {
      userId,
      rank: rankIndex === -1 ? null : rankIndex + 1,
      score: scores[userId] || 0,
      totalUsers: leaderboard.length,
    });

    return json(200, {
      weekStartDate,
      rank: rankIndex === -1 ? null : rankIndex + 1,
      score: scores[userId] || 0,
      totalUsers: leaderboard.length,
    });
  } catch (error) {
    console.log('[weekly_ranking] unexpected error', getErrorMessage(error));
    return json(500, {
      error: 'Failed to load weekly ranking',
      details: getErrorMessage(error),
    });
  }
});
