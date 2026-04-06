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
  created_at: string;
};

type LikeRow = {
  target_id: string;
};

type MatchCheckInRow = {
  match_id: string;
  user_id: string;
  created_at: string;
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

const COPENHAGEN_TIMEZONE = 'Europe/Copenhagen';
const FALLBACK_BODY = 'Har været en af ugens mest aktive fans i fællesskabet.';
const CHECKIN_SCORE = 5;

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

    if (
      !forced &&
      !(copenhagen.weekday === 'Mon' && copenhagen.hour === 12)
    ) {
      return json(200, {
        ok: true,
        forced,
        mode: 'skipped',
        reason: 'outside_copenhagen_window',
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
        week_start_date: weekStartDate,
        row: existingWeeklyTopFan,
      });
    }

    const [postsResponse, commentsResponse, checkinsResponse, recentWinnersResponse] =
      await Promise.all([
        supabase
          .from('posts')
          .select('id, author_id, text, created_at')
          .gte('created_at', windowStartIso)
          .lt('created_at', windowEndIso),
        supabase
          .from('comments_v2')
          .select('id, author_id, text, created_at')
          .gte('created_at', windowStartIso)
          .lt('created_at', windowEndIso),
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

    const posts = (postsResponse.data || []) as PostRow[];
    const comments = (commentsResponse.data || []) as CommentRow[];
    const checkins = (checkinsResponse.data || []) as MatchCheckInRow[];
    const recentWinnerIds = new Set((recentWinnersResponse.data || []).map((row) => row.user_id));

    const postIds = posts.map((post) => post.id);
    const commentIds = comments.map((comment) => comment.id);

    const [postLikesResponse, commentLikesResponse] = await Promise.all([
      postIds.length > 0
        ? supabase
            .from('likes_v2')
            .select('target_id')
            .eq('target_type', 'post')
            .gte('created_at', windowStartIso)
            .lt('created_at', windowEndIso)
            .in('target_id', postIds)
        : Promise.resolve({ data: [], error: null }),
      commentIds.length > 0
        ? supabase
            .from('likes_v2')
            .select('target_id')
            .eq('target_type', 'comment')
            .gte('created_at', windowStartIso)
            .lt('created_at', windowEndIso)
            .in('target_id', commentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (postLikesResponse.error) {
      return json(500, {
        error: 'Failed to fetch post likes',
        details: postLikesResponse.error,
      });
    }
    if (commentLikesResponse.error) {
      return json(500, {
        error: 'Failed to fetch comment likes',
        details: commentLikesResponse.error,
      });
    }

    const postLikeRows = (postLikesResponse.data || []) as LikeRow[];
    const commentLikeRows = (commentLikesResponse.data || []) as LikeRow[];

    const postLikeCountByPostId = new Map<string, number>();
    for (const row of postLikeRows) {
      postLikeCountByPostId.set(
        row.target_id,
        (postLikeCountByPostId.get(row.target_id) || 0) + 1,
      );
    }

    const commentLikeCountByCommentId = new Map<string, number>();
    for (const row of commentLikeRows) {
      commentLikeCountByCommentId.set(
        row.target_id,
        (commentLikeCountByCommentId.get(row.target_id) || 0) + 1,
      );
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

    for (const post of posts) {
      const candidate = ensureCandidate(post.author_id);
      candidate.postCount += 1;
      candidate.latestActivityAt =
        !candidate.latestActivityAt || candidate.latestActivityAt < post.created_at
          ? post.created_at
          : candidate.latestActivityAt;
    }

    for (const comment of comments) {
      const candidate = ensureCandidate(comment.author_id);
      candidate.commentCount += 1;
      candidate.latestActivityAt =
        !candidate.latestActivityAt || candidate.latestActivityAt < comment.created_at
          ? comment.created_at
          : candidate.latestActivityAt;
    }

    for (const checkin of checkins) {
      const candidate = ensureCandidate(checkin.user_id);
      candidate.checkinCount += 1;
      candidate.latestActivityAt =
        !candidate.latestActivityAt || candidate.latestActivityAt < checkin.created_at
          ? checkin.created_at
          : candidate.latestActivityAt;
    }

    for (const post of posts) {
      const likesReceived = postLikeCountByPostId.get(post.id) || 0;
      if (likesReceived <= 0) continue;
      const candidate = ensureCandidate(post.author_id);
      candidate.postLikesReceived += likesReceived;
    }

    for (const comment of comments) {
      const likesReceived = commentLikeCountByCommentId.get(comment.id) || 0;
      if (likesReceived <= 0) continue;
      const candidate = ensureCandidate(comment.author_id);
      candidate.commentLikesReceived += likesReceived;
    }

    const rankedCandidates = Array.from(candidates.values())
      .map((candidate) => {
        const activityVariety = [
          candidate.postCount > 0,
          candidate.commentCount > 0,
          candidate.checkinCount > 0,
        ].filter(Boolean).length;

        const weeklyScore =
          candidate.postCount * 5 +
          candidate.commentCount * 3 +
          candidate.postLikesReceived +
          candidate.commentLikesReceived +
          candidate.checkinCount * CHECKIN_SCORE;

        return {
          ...candidate,
          activityVariety,
          weeklyScore,
        };
      })
      .filter((candidate) => candidate.weeklyScore >= 20)
      .filter((candidate) => !recentWinnerIds.has(candidate.userId))
      .sort((a, b) => {
        return (
          b.weeklyScore - a.weeklyScore ||
          b.activityVariety - a.activityVariety ||
          (b.postCount + b.commentCount + b.checkinCount) -
            (a.postCount + a.commentCount + a.checkinCount) ||
          b.checkinCount - a.checkinCount ||
          new Date(b.latestActivityAt || 0).getTime() -
            new Date(a.latestActivityAt || 0).getTime()
        );
      });

    const winner = rankedCandidates[0];

    if (!winner) {
      return json(200, {
        ok: true,
        forced,
        mode: 'skipped',
        week_start_date: weekStartDate,
        reason: 'no_qualifying_candidate',
      });
    }

    const winnerProfile = await fetchWinnerProfile(supabase, winner.userId);

    const topPost =
      posts
        .filter((post) => post.author_id === winner.userId)
        .map((post) => ({
          id: post.id,
          text: post.text,
          likes: postLikeCountByPostId.get(post.id) || 0,
          createdAt: post.created_at,
        }))
        .sort(compareBySpotlightValue)[0] || null;

    const topComment =
      comments
        .filter((comment) => comment.author_id === winner.userId)
        .map((comment) => ({
          id: comment.id,
          text: comment.text,
          likes: commentLikeCountByCommentId.get(comment.id) || 0,
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
