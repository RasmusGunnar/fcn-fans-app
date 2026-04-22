import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

type FanLevelKey =
  | 'new_fan'
  | 'community_member'
  | 'regular_voice'
  | 'community_core'
  | 'dedicated'
  | 'top_fan';

type ReasonType = 'post' | 'comment' | 'activity' | 'checkin';

type WeeklyTopFanRequest = {
  job_name?: 'weekly_top_fan';
  force?: boolean;
  week_start_date?: string;
};

type PostRow = {
  id: string;
  author_id: string;
  text: string | null;
  created_at: string;
};

type CommentRow = {
  id: string;
  author_id: string;
  text: string;
  target_type: string;
  target_id: string;
  created_at: string;
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

type ContentAuthorRow = {
  id: string;
  author_id: string | null;
};

type FixtureRow = {
  id: string;
  home_team: string | null;
  away_team: string | null;
};

type Candidate = {
  userId: string;
  postCount: number;
  commentCount: number;
  checkinCount: number;
  postLikesReceived: number;
  commentLikesReceived: number;
  activityVariety: number;
  weeklyScore: number;
  latestActivityAt: string | null;
};

type TopContent = {
  id: string;
  text: string | null;
  likes: number;
  createdAt: string;
};

type WinnerProfile = {
  displayName: string;
  fanLevelKey: FanLevelKey | null;
};

type WinnerSelectionMode = 'strict' | 'fallback';

const COPENHAGEN_TIMEZONE = 'Europe/Copenhagen';
const FALLBACK_BODY = 'Har været en af ugens mest aktive fans i fællesskabet.';
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
const QUALIFYING_SCORE_THRESHOLD = 25;
const MIN_ACTIVE_SOURCES = 2;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const WEEKLY_TOP_FAN_PUBLISH_WEEKDAY = 'Wed';
const WEEKLY_TOP_FAN_PUBLISH_HOUR = 12;
const WEEKLY_TOP_FAN_PUBLISH_RULE = 'Wednesday 12:00 Europe/Copenhagen';

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function truncatePreview(text: string | null | undefined, maxLength = 88): string {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function getWeekStartDate(baseDate: Date): string {
  const date = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()),
  );
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPreviousWeekStartDate(baseDate: Date): string {
  return addDays(getWeekStartDate(baseDate), -7);
}

function getWeekWindowStartIso(weekStartDate: string): string {
  return new Date(`${weekStartDate}T00:00:00Z`).toISOString();
}

function getWeekWindowEndIso(weekStartDate: string): string {
  return new Date(`${addDays(weekStartDate, 7)}T00:00:00Z`).toISOString();
}

function getCooldownStartDate(weekStartDate: string): string {
  return addDays(weekStartDate, -21);
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
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a')
    .replace(/Ã¦/g, 'ae')
    .replace(/Ã¸/g, 'o')
    .replace(/Ã¥/g, 'a');
}

function isFcnHomeFixture(fixture: FixtureRow | null | undefined): boolean {
  const homeName = normalizeTeamName(fixture?.home_team);
  return FCN_TEAM_NAME_MATCHERS.some((matcher) => homeName.includes(matcher));
}

function isFcnAwayFixture(fixture: FixtureRow | null | undefined): boolean {
  const awayName = normalizeTeamName(fixture?.away_team);
  return FCN_TEAM_NAME_MATCHERS.some((matcher) => awayName.includes(matcher));
}

function sortRowsByCreatedAtAsc<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function isFanLevelKey(value: unknown): value is FanLevelKey {
  return (
    value === 'new_fan' ||
    value === 'community_member' ||
    value === 'regular_voice' ||
    value === 'community_core' ||
    value === 'dedicated' ||
    value === 'top_fan'
  );
}

function compareBySpotlightValue<T extends { likes: number; createdAt: string }>(a: T, b: T): number {
  return b.likes - a.likes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function getCandidateActivitySignalCount(candidate: Candidate): number {
  return (
    candidate.postCount +
    candidate.commentCount +
    candidate.checkinCount +
    candidate.postLikesReceived +
    candidate.commentLikesReceived
  );
}

function compareCandidates<T extends Candidate & { activityVariety: number }>(a: T, b: T): number {
  return (
    b.weeklyScore - a.weeklyScore ||
    b.activityVariety - a.activityVariety ||
    getCandidateActivitySignalCount(b) - getCandidateActivitySignalCount(a) ||
    b.checkinCount - a.checkinCount ||
    new Date(b.latestActivityAt || 0).getTime() -
      new Date(a.latestActivityAt || 0).getTime()
  );
}

function getCopenhagenParts(baseDate: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: COPENHAGEN_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const formatted = formatter.formatToParts(baseDate);
  const weekday = formatted.find((part) => part.type === 'weekday')?.value || '';
  const hour = Number(formatted.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(formatted.find((part) => part.type === 'minute')?.value || '0');

  return { weekday, hour, minute };
}

function isWeeklyTopFanPublishWindow(parts: ReturnType<typeof getCopenhagenParts>): boolean {
  return (
    parts.weekday === WEEKLY_TOP_FAN_PUBLISH_WEEKDAY &&
    parts.hour === WEEKLY_TOP_FAN_PUBLISH_HOUR
  );
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant(input: string, variants: string[]): string {
  if (variants.length === 0) return '';
  return variants[hashSeed(input) % variants.length];
}

function buildReasonCopy({
  displayName,
  candidate,
  topPost,
  topComment,
  weekStartDate,
}: {
  displayName: string;
  candidate: Candidate;
  topPost: TopContent | null;
  topComment: TopContent | null;
  weekStartDate: string;
}): {
  reasonType: ReasonType;
  referencePostId: string | null;
  referenceCommentId: string | null;
  title: string;
  subtitle: string;
  body: string;
} {
  const seed = `${weekStartDate}:${displayName}`;

  if (topPost && topPost.likes > 0) {
    const preview = truncatePreview(topPost.text);
    return {
      reasonType: 'post',
      referencePostId: topPost.id,
      referenceCommentId: null,
      title: 'Ugens Topfan',
      subtitle: pickVariant(seed, [
        `${displayName} har skabt stort engagement i denne uge`,
        `${displayName} har sat et tydeligt præg på fællesskabet i denne uge`,
        `${displayName} har løftet samtalen med et stærkt opslag`,
      ]),
      body: preview
        ? `${pickVariant(seed, [
            'Fremhævet for sit opslag',
            'Valgt på baggrund af sit opslag',
            'Spotlight på opslaget',
          ])}: "${preview}"`
        : FALLBACK_BODY,
    };
  }

  if (topComment && topComment.likes > 0) {
    const preview = truncatePreview(topComment.text);
    return {
      reasonType: 'comment',
      referencePostId: null,
      referenceCommentId: topComment.id,
      title: 'Ugens Topfan',
      subtitle: pickVariant(seed, [
        `${displayName} har markeret sig i kommentarsporene`,
        `${displayName} har sat sig igennem i ugens samtaler`,
        `${displayName} har løftet stemningen i kommentarerne denne uge`,
      ]),
      body: preview
        ? `${pickVariant(seed, [
            'Fremhævet for kommentaren',
            'Valgt på baggrund af kommentaren',
            'Spotlight på kommentaren',
          ])}: "${preview}"`
        : FALLBACK_BODY,
    };
  }

  if (candidate.postCount > 0 || candidate.commentCount > 0) {
    return {
      reasonType: 'activity',
      referencePostId: null,
      referenceCommentId: null,
      title: 'Ugens Topfan',
      subtitle: pickVariant(seed, [
        `${displayName} har været en af ugens mest aktive fans`,
        `${displayName} har været med til at holde fællesskabet levende`,
        `${displayName} har sat tydelige spor i fællesskabet denne uge`,
      ]),
      body: FALLBACK_BODY,
    };
  }

  return {
    reasonType: 'checkin',
    referencePostId: null,
    referenceCommentId: null,
    title: 'Ugens Topfan',
    subtitle: pickVariant(seed, [
      `${displayName} har været stærkt til stede omkring kampene`,
      `${displayName} har vist stærk tilstedeværelse i ugens FCN-oplevelser`,
      `${displayName} har været synlig omkring kampene og fællesskabet`,
    ]),
    body: FALLBACK_BODY,
  };
}

async function readRequest(
  req: Request,
): Promise<Required<Pick<WeeklyTopFanRequest, 'force'>> & Pick<WeeklyTopFanRequest, 'week_start_date'>> {
  try {
    const body = (await req.json()) as WeeklyTopFanRequest;
    return {
      force: Boolean(body?.force),
      week_start_date: body?.week_start_date,
    };
  } catch {
    return { force: false, week_start_date: undefined };
  }
}

async function loadCommentRows(
  supabase: ReturnType<typeof createClient>,
  windowStartIso: string,
  windowEndIso: string,
): Promise<{ data: CommentRow[] | null; error: { message?: string } | null }> {
  const commentsV2Response = await supabase
    .from('comments_v2')
    .select('id, author_id, text, target_type, target_id, created_at')
    .gte('created_at', windowStartIso)
    .lt('created_at', windowEndIso);

  if (!commentsV2Response.error) {
    return {
      data: (commentsV2Response.data || []) as CommentRow[],
      error: null,
    };
  }

  const message = commentsV2Response.error.message?.toLowerCase() || '';
  const isMissingRelation =
    commentsV2Response.error.code === '42P01' ||
    commentsV2Response.error.code === 'PGRST204' ||
    commentsV2Response.error.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('not found');

  if (!isMissingRelation) {
    return {
      data: null,
      error: commentsV2Response.error,
    };
  }

  const commentsResponse = await supabase
    .from('comments')
    .select('id, author_id, text, post_id, created_at')
    .gte('created_at', windowStartIso)
    .lt('created_at', windowEndIso);

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
      text: string;
      post_id: string;
      created_at: string;
    }>).map((comment) => ({
      id: comment.id,
      author_id: comment.author_id,
      text: comment.text,
      target_type: 'post',
      target_id: comment.post_id,
      created_at: comment.created_at,
    })),
    error: null,
  };
}

async function loadCommentAuthorRows(
  supabase: ReturnType<typeof createClient>,
  commentIds: string[],
): Promise<{ data: ContentAuthorRow[] | null; error: { message?: string } | null }> {
  if (commentIds.length === 0) {
    return { data: [], error: null };
  }

  const commentsV2Response = await supabase
    .from('comments_v2')
    .select('id, author_id')
    .in('id', commentIds);

  if (!commentsV2Response.error) {
    return {
      data: (commentsV2Response.data || []) as ContentAuthorRow[],
      error: null,
    };
  }

  const message = commentsV2Response.error.message?.toLowerCase() || '';
  const isMissingRelation =
    commentsV2Response.error.code === '42P01' ||
    commentsV2Response.error.code === 'PGRST204' ||
    commentsV2Response.error.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('not found');

  if (!isMissingRelation) {
    return {
      data: null,
      error: commentsV2Response.error,
    };
  }

  const commentsResponse = await supabase
    .from('comments')
    .select('id, author_id')
    .in('id', commentIds);

  return {
    data: (commentsResponse.data || []) as ContentAuthorRow[],
    error: commentsResponse.error,
  };
}

async function fetchWinnerProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<WinnerProfile> {
  const withFanLevel = await supabase
    .from('profiles')
    .select('id, display_name, fan_level_key')
    .eq('id', userId)
    .maybeSingle();

  if (!withFanLevel.error && withFanLevel.data) {
    const data = withFanLevel.data as { display_name?: string | null; fan_level_key?: unknown };
    return {
      displayName: data.display_name?.trim() || 'En FCN-fan',
      fanLevelKey: isFanLevelKey(data.fan_level_key) ? data.fan_level_key : null,
    };
  }

  const fallback = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .maybeSingle();

  if (fallback.error) {
    throw fallback.error;
  }

  const data = fallback.data as { display_name?: string | null } | null;
  return {
    displayName: data?.display_name?.trim() || 'En FCN-fan',
    fanLevelKey: null,
  };
}

serve(async (req) => {
  try {
    const syncSecret = Deno.env.get('SYNC_SECRET');
    const providedSecret = req.headers.get('x-sync-secret');

    if (!syncSecret || !providedSecret || providedSecret !== syncSecret) {
      return json(401, { error: 'Unauthorized' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, { error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const requestData = await readRequest(req);
    const forced = requestData.force;
    const now = new Date();
    const copenhagen = getCopenhagenParts(now);

    // Authoritative publish cadence:
    // Wednesday 12:00 Europe/Copenhagen publishes the winner for the
    // previous completed Monday-based week.
    if (!forced && !isWeeklyTopFanPublishWindow(copenhagen)) {
      return json(200, {
        ok: true,
        forced,
        mode: 'skipped',
        reason: 'outside_copenhagen_window',
        publish_rule: WEEKLY_TOP_FAN_PUBLISH_RULE,
        timezone: COPENHAGEN_TIMEZONE,
        local_weekday: copenhagen.weekday,
        local_hour: copenhagen.hour,
        local_minute: copenhagen.minute,
      });
    }

    // Score the completed week keyed by its Monday date, so reruns always use the
    // same closed [week_start_date, week_start_date + 7 days) interval.
    const weekStartDate = requestData.week_start_date || getPreviousWeekStartDate(now);
    const windowStartIso = getWeekWindowStartIso(weekStartDate);
    const windowEndIso = getWeekWindowEndIso(weekStartDate);
    const cooldownStartDate = getCooldownStartDate(weekStartDate);

    const { data: existingWeeklyTopFan, error: existingError } = await supabase
      .from('weekly_top_fan')
      .select('*')
      .eq('week_start_date', weekStartDate)
      .maybeSingle();

    if (existingError) {
      return json(500, {
        error: 'Failed to read existing weekly_top_fan row',
        details: existingError,
      });
    }

    if (existingWeeklyTopFan && !requestData.force) {
      return json(200, {
        ok: true,
        forced,
        mode: 'existing',
        publish_rule: WEEKLY_TOP_FAN_PUBLISH_RULE,
        week_start_date: weekStartDate,
        row: existingWeeklyTopFan,
      });
    }

    const [
      postsResponse,
      commentsResponse,
      checkinsResponse,
      recentWinnersResponse,
      likesResponse,
      appAdminsResponse,
    ] =
      await Promise.all([
        supabase
          .from('posts')
          .select('id, author_id, text, created_at')
          .gte('created_at', windowStartIso)
          .lt('created_at', windowEndIso),
        loadCommentRows(supabase, windowStartIso, windowEndIso),
        supabase
          .from('match_checkins')
          .select('match_id, user_id, created_at')
          .gte('created_at', windowStartIso)
          .lt('created_at', windowEndIso),
        supabase
          .from('weekly_top_fan')
          .select('user_id')
          .gte('week_start_date', cooldownStartDate)
          .lt('week_start_date', weekStartDate),
        supabase
          .from('likes_v2')
          .select('user_id, target_type, target_id, created_at')
          .gte('created_at', windowStartIso)
          .lt('created_at', windowEndIso)
          .in('target_type', ['post', 'comment']),
        supabase
          .from('app_admins')
          .select('user_id'),
      ]);

    if (postsResponse.error) {
      return json(500, { error: 'Failed to fetch posts', details: postsResponse.error });
    }
    if (commentsResponse.error) {
      return json(500, { error: 'Failed to fetch comments', details: commentsResponse.error });
    }
    if (checkinsResponse.error) {
      return json(500, { error: 'Failed to fetch check-ins', details: checkinsResponse.error });
    }
    if (recentWinnersResponse.error) {
      return json(500, {
        error: 'Failed to fetch recent winners',
        details: recentWinnersResponse.error,
      });
    }
    if (likesResponse.error) {
      return json(500, {
        error: 'Failed to fetch likes',
        details: likesResponse.error,
      });
    }
    if (appAdminsResponse.error) {
      return json(500, {
        error: 'Failed to fetch app admins',
        details: appAdminsResponse.error,
      });
    }

    const posts = (postsResponse.data || []) as PostRow[];
    const comments = (commentsResponse.data || []) as CommentRow[];
    const checkins = (checkinsResponse.data || []) as MatchCheckInRow[];
    const likes = (likesResponse.data || []) as LikeRow[];
    const recentWinnerIds = new Set((recentWinnersResponse.data || []).map((row) => row.user_id));
    const adminUserIds = new Set((appAdminsResponse.data || []).map((row) => row.user_id));

    const likedPostIds = Array.from(
      new Set(likes.filter((like) => like.target_type === 'post').map((like) => like.target_id)),
    );
    const likedCommentIds = Array.from(
      new Set(
        likes.filter((like) => like.target_type === 'comment').map((like) => like.target_id),
      ),
    );
    const checkinMatchIds = Array.from(
      new Set(checkins.map((checkin) => checkin.match_id).filter(Boolean)),
    );

    const [likedPostsResponse, likedCommentsResponse, fixturesResponse] = await Promise.all([
      likedPostIds.length > 0
        ? supabase
            .from('posts')
            .select('id, author_id')
            .in('id', likedPostIds)
        : Promise.resolve({ data: [], error: null }),
      loadCommentAuthorRows(supabase, likedCommentIds),
      checkinMatchIds.length > 0
        ? supabase
            .from('fixtures')
            .select('id, home_team, away_team')
            .in('id', checkinMatchIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (likedPostsResponse.error) {
      return json(500, {
        error: 'Failed to fetch liked posts',
        details: likedPostsResponse.error,
      });
    }
    if (likedCommentsResponse.error) {
      return json(500, {
        error: 'Failed to fetch liked comments',
        details: likedCommentsResponse.error,
      });
    }
    if (fixturesResponse.error) {
      return json(500, {
        error: 'Failed to fetch fixtures',
        details: fixturesResponse.error,
      });
    }

    const candidates = new Map<string, Candidate>();

    const ensureCandidate = (userId: string): Candidate => {
      const existing = candidates.get(userId);
      if (existing) return existing;

      const candidate: Candidate = {
        userId,
        postCount: 0,
        commentCount: 0,
        checkinCount: 0,
        postLikesReceived: 0,
        commentLikesReceived: 0,
        activityVariety: 0,
        weeklyScore: 0,
        latestActivityAt: null,
      };
      candidates.set(userId, candidate);
      return candidate;
    };

    const postAuthorById = new Map<string, string>();
    posts.forEach((post) => {
      if (post.id && post.author_id) {
        postAuthorById.set(post.id, post.author_id);
      }
    });

    const commentAuthorById = new Map<string, string>();
    comments.forEach((comment) => {
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
    sortRowsByCreatedAtAsc(posts).forEach((post) => {
      const dayKey = getCopenhagenDateKey(post.created_at);
      const userDayKey = `${post.author_id}:${dayKey}`;
      const acceptedCount = acceptedPostsPerUserDay.get(userDayKey) || 0;

      if (acceptedCount >= DAILY_POST_CAP) {
        return;
      }

      acceptedPostsPerUserDay.set(userDayKey, acceptedCount + 1);
      const candidate = ensureCandidate(post.author_id);
      candidate.postCount += 1;
      candidate.weeklyScore += POST_SCORE;
      candidate.latestActivityAt =
        !candidate.latestActivityAt || candidate.latestActivityAt < post.created_at
          ? post.created_at
          : candidate.latestActivityAt;
    });

    const acceptedCommentsPerUserDay = new Map<string, number>();
    const acceptedCommentTimestampsByUserTarget = new Map<string, number[]>();
    sortRowsByCreatedAtAsc(comments).forEach((comment) => {
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

      const candidate = ensureCandidate(comment.author_id);
      candidate.commentCount += 1;
      candidate.weeklyScore += COMMENT_SCORE;
      candidate.latestActivityAt =
        !candidate.latestActivityAt || candidate.latestActivityAt < comment.created_at
          ? comment.created_at
          : candidate.latestActivityAt;
    });

    const acceptedReceivedLikesPerUserDay = new Map<string, number>();
    const acceptedReceivedLikesPerTarget = new Map<string, number>();
    const acceptedPostLikeCountByPostId = new Map<string, number>();
    const acceptedCommentLikeCountByCommentId = new Map<string, number>();
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

      const candidate = ensureCandidate(targetAuthorId);
      candidate.weeklyScore += LIKE_RECEIVED_SCORE;
      if (like.target_type === 'post') {
        candidate.postLikesReceived += 1;
        acceptedPostLikeCountByPostId.set(
          like.target_id,
          (acceptedPostLikeCountByPostId.get(like.target_id) || 0) + 1,
        );
      } else {
        candidate.commentLikesReceived += 1;
        acceptedCommentLikeCountByCommentId.set(
          like.target_id,
          (acceptedCommentLikeCountByCommentId.get(like.target_id) || 0) + 1,
        );
      }
    });

    const acceptedCheckIns = new Set<string>();
    sortRowsByCreatedAtAsc(checkins).forEach((checkin) => {
      const uniqueCheckInKey = `${checkin.user_id}:${checkin.match_id}`;
      if (acceptedCheckIns.has(uniqueCheckInKey)) {
        return;
      }

      acceptedCheckIns.add(uniqueCheckInKey);

      const fixture = fixturesById.get(checkin.match_id);
      const points = isFcnAwayFixture(fixture) ? AWAY_CHECKIN_SCORE : HOME_CHECKIN_SCORE;
      const candidate = ensureCandidate(checkin.user_id);
      candidate.checkinCount += 1;
      candidate.weeklyScore += points;
      candidate.latestActivityAt =
        !candidate.latestActivityAt || candidate.latestActivityAt < checkin.created_at
          ? checkin.created_at
          : candidate.latestActivityAt;
    });

    const allEligibleCandidates = Array.from(candidates.values())
      .map((candidate) => {
        const activityVariety = [
          candidate.postCount > 0,
          candidate.commentCount > 0,
          candidate.checkinCount > 0,
        ].filter(Boolean).length;

        return {
          ...candidate,
          activityVariety,
        };
      })
      .filter((candidate) => !adminUserIds.has(candidate.userId))
      .filter((candidate) => getCandidateActivitySignalCount(candidate) > 0)
      .sort(compareCandidates);

    const strictCandidates = allEligibleCandidates
      .filter((candidate) => candidate.weeklyScore >= QUALIFYING_SCORE_THRESHOLD)
      .filter((candidate) => candidate.activityVariety >= MIN_ACTIVE_SOURCES)
      .filter((candidate) => !recentWinnerIds.has(candidate.userId));

    const winner = strictCandidates[0] || allEligibleCandidates[0];
    const selectionMode: WinnerSelectionMode = strictCandidates[0] ? 'strict' : 'fallback';

    if (!winner) {
      return json(200, {
        ok: true,
        forced,
        mode: 'skipped',
        publish_rule: WEEKLY_TOP_FAN_PUBLISH_RULE,
        week_start_date: weekStartDate,
        reason: 'no_non_admin_candidate_with_activity',
      });
    }

    console.log('[weekly_top_fan] Winner selected', {
      week_start_date: weekStartDate,
      selection_mode: selectionMode,
      candidate_count: candidates.size,
      eligible_candidate_count: allEligibleCandidates.length,
      strict_candidate_count: strictCandidates.length,
      admin_excluded_count: Array.from(candidates.keys()).filter((userId) => adminUserIds.has(userId))
        .length,
      winner_user_id: winner.userId,
      weekly_score: winner.weeklyScore,
      activity_variety: winner.activityVariety,
    });

    const winnerProfile = await fetchWinnerProfile(supabase, winner.userId);

    const topPost =
      posts
        .filter((post) => post.author_id === winner.userId)
        .map((post) => ({
          id: post.id,
          text: post.text,
          likes: acceptedPostLikeCountByPostId.get(post.id) || 0,
          createdAt: post.created_at,
        }))
        .sort(compareBySpotlightValue)[0] || null;

    const topComment =
      comments
        .filter((comment) => comment.author_id === winner.userId)
        .map((comment) => ({
          id: comment.id,
          text: comment.text,
          likes: acceptedCommentLikeCountByCommentId.get(comment.id) || 0,
          createdAt: comment.created_at,
        }))
        .sort(compareBySpotlightValue)[0] || null;

    const reasonCopy = buildReasonCopy({
      displayName: winnerProfile.displayName,
      candidate: winner,
      topPost,
      topComment,
      weekStartDate,
    });

    const payload = {
      week_start_date: weekStartDate,
      generated_at: now.toISOString(),
      user_id: winner.userId,
      // profiles.fan_level_key is the primary source of truth.
      fan_level_key: winnerProfile.fanLevelKey || 'new_fan',
      weekly_score: winner.weeklyScore,
      reason_type: reasonCopy.reasonType,
      reference_post_id: reasonCopy.referencePostId,
      reference_comment_id: reasonCopy.referenceCommentId,
      title: reasonCopy.title,
      subtitle: reasonCopy.subtitle,
      body: reasonCopy.body || FALLBACK_BODY,
      cta_label: 'Se profil',
      is_published: true,
    };

    const { data: upsertedRow, error: upsertError } = await supabase
      .from('weekly_top_fan')
      .upsert(payload, { onConflict: 'week_start_date' })
      .select('*')
      .single();

    if (upsertError) {
      return json(500, {
        error: 'Failed to upsert weekly_top_fan row',
        details: upsertError,
      });
    }

    return json(200, {
      ok: true,
      forced,
      mode: existingWeeklyTopFan ? 'updated' : 'created',
      selection_mode: selectionMode,
      publish_rule: WEEKLY_TOP_FAN_PUBLISH_RULE,
      week_start_date: weekStartDate,
      timezone: COPENHAGEN_TIMEZONE,
      winner: {
        user_id: winner.userId,
        display_name: winnerProfile.displayName,
        fan_level_key: payload.fan_level_key,
        weekly_score: winner.weeklyScore,
        activity_variety: winner.activityVariety,
        post_count: winner.postCount,
        comment_count: winner.commentCount,
        checkin_count: winner.checkinCount,
        post_likes_received: winner.postLikesReceived,
        comment_likes_received: winner.commentLikesReceived,
      },
      row: upsertedRow,
    });
  } catch (error) {
    return json(500, {
      error: 'Internal server error',
      details: String(error),
    });
  }
});
