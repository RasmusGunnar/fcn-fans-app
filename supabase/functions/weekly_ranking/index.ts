import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

type PostRow = {
  author_id: string;
  created_at: string;
};

type CommentRow = {
  author_id: string;
  created_at: string;
};

type MatchCheckInRow = {
  user_id: string;
  created_at: string;
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
const POST_SCORE = 5;
const COMMENT_SCORE = 2;
const CHECKIN_SCORE = 10;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
) {
  const commentsV2Response = await adminClient
    .from('comments_v2')
    .select('author_id, created_at')
    .gte('created_at', weekStartIso);

  if (!commentsV2Response.error) {
    console.log('[weekly_ranking] using comments_v2');
    return commentsV2Response;
  }

  if (!isMissingRelation(commentsV2Response.error)) {
    return commentsV2Response;
  }

  console.log('[weekly_ranking] comments_v2 missing, falling back to comments');

  return await adminClient
    .from('comments')
    .select('author_id, created_at')
    .gte('created_at', weekStartIso);
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, {
        error: 'Missing Supabase configuration',
        details: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be configured',
      });
    }

    const requestData = await readRequest(req);
    console.log('[weekly_ranking] request body', requestData);
    const userId =
      typeof requestData?.userId === 'string' && requestData.userId.trim().length > 0
        ? requestData.userId.trim()
        : null;

    if (!userId) {
      console.log('[weekly_ranking] missing userId');
      return json(400, { error: 'Missing userId' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { weekStartDate, weekStartIso } = getCurrentWeekWindow(new Date());
    console.log('[weekly_ranking] query window', { userId, weekStartDate, weekStartIso });

    const [postsResponse, commentsResponse, checkinsResponse] = await Promise.all([
      adminClient
        .from('posts')
        .select('author_id, created_at')
        .gte('created_at', weekStartIso),
      loadCommentRows(adminClient, weekStartIso),
      adminClient
        .from('match_checkins')
        .select('user_id, created_at')
        .gte('created_at', weekStartIso),
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

    console.log('[weekly_ranking] query counts', {
      posts: (postsResponse.data || []).length,
      comments: (commentsResponse.data || []).length,
      checkins: (checkinsResponse.data || []).length,
    });

    const scores: Record<string, number> = {};
    const latestActivityAt: Record<string, string> = {};

    const addScore = (userId: string | null | undefined, value: number, createdAt: string) => {
      if (!userId) return;

      scores[userId] = (scores[userId] || 0) + value;
      if (!latestActivityAt[userId] || latestActivityAt[userId] < createdAt) {
        latestActivityAt[userId] = createdAt;
      }
    };

    ((postsResponse.data || []) as PostRow[]).forEach((post) => {
      addScore(post.author_id, POST_SCORE, post.created_at);
    });

    ((commentsResponse.data || []) as CommentRow[]).forEach((comment) => {
      addScore(comment.author_id, COMMENT_SCORE, comment.created_at);
    });

    ((checkinsResponse.data || []) as MatchCheckInRow[]).forEach((checkin) => {
      addScore(checkin.user_id, CHECKIN_SCORE, checkin.created_at);
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
