export type WeeklyScoreActivityType =
  | 'post'
  | 'poll_post'
  | 'media_article'
  | 'comment'
  | 'reply'
  | 'like_given_post'
  | 'like_given_comment'
  | 'like_received_post'
  | 'like_received_comment'
  | 'poll_vote'
  | 'match_rsvp'
  | 'event_rsvp'
  | 'fan_activity_registration'
  | 'checkin_home'
  | 'checkin_away';

export type WeeklyScoreCategory =
  | 'post_or_poll'
  | 'comment_or_reply'
  | 'likes_given'
  | 'likes_received'
  | 'poll_vote'
  | 'participation'
  | 'checkin';

export type WeeklyScoreSourceTable =
  | 'posts'
  | 'comments_v2'
  | 'likes_v2'
  | 'poll_votes'
  | 'rsvps'
  | 'match_checkins'
  | 'fan_activity_registrations'
  | 'user_upcoming_items';

export type WeeklyScoreProfileRow = {
  id: string;
  display_name?: string | null;
  username?: string | null;
};

export type WeeklyScorePostRow = {
  id: string;
  author_id: string | null;
  created_at: string;
  post_type?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  poll_data?: unknown | null;
};

export type WeeklyScoreCommentRow = {
  id: string;
  author_id: string | null;
  target_type: string;
  target_id: string;
  created_at: string;
  parent_id?: string | null;
};

export type WeeklyScoreLikeRow = {
  id?: string | null;
  user_id: string | null;
  target_type: 'post' | 'comment' | string;
  target_id: string;
  created_at: string;
};

export type WeeklyScorePollVoteRow = {
  id?: string | null;
  post_id: string;
  option_id: string;
  user_id: string | null;
  created_at: string;
};

export type WeeklyScoreRsvpRow = {
  id?: string | null;
  entity_type: 'match' | 'event' | string;
  entity_id: string;
  user_id: string | null;
  status: string;
  created_at: string;
};

export type WeeklyScoreCheckInRow = {
  id?: string | null;
  match_id: string;
  user_id: string | null;
  created_at: string;
};

export type WeeklyScoreFixtureRow = {
  id: string;
  home_team?: string | null;
  away_team?: string | null;
};

export type WeeklyScoreFanActivityRegistrationRow = {
  id: string;
  fan_activity_id: string;
  user_id: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

export type WeeklyScoreBusTripSignalRow = {
  id: string;
  user_id: string | null;
  target_type: string;
  target_id: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

export type WeeklyScoreMediaArticleCandidateRow = {
  id: string;
  published_post_id: string | null;
  status?: string | null;
  reviewed_by?: string | null;
  source_key?: string | null;
};

export type WeeklyScoreInput = {
  weekStartUtc: string;
  weekEndUtc: string;
  weekStartDate: string;
  weekEndDate: string;
  profiles: WeeklyScoreProfileRow[];
  appAdminUserIds: string[];
  recentWinnerUserIds: string[];
  posts: WeeklyScorePostRow[];
  comments: WeeklyScoreCommentRow[];
  likes: WeeklyScoreLikeRow[];
  pollVotes: WeeklyScorePollVoteRow[];
  rsvps: WeeklyScoreRsvpRow[];
  matchCheckins: WeeklyScoreCheckInRow[];
  fixtures: WeeklyScoreFixtureRow[];
  fanActivityRegistrations: WeeklyScoreFanActivityRegistrationRow[];
  busTripSignals?: WeeklyScoreBusTripSignalRow[];
  mediaArticleCandidates?: WeeklyScoreMediaArticleCandidateRow[];
  includeDetails?: boolean;
};

export type WeeklyScoreEvent = {
  userId: string;
  sourceTable: WeeklyScoreSourceTable;
  occurredAt: string;
  activityType: WeeklyScoreActivityType;
  sourceId: string;
  targetType?: string | null;
  targetId?: string | null;
  points: number;
  counts: boolean;
  reason: string;
};

export type WeeklyScoreUserSummary = {
  userId: string;
  displayName: string | null;
  hasProfile: boolean;
  isAdmin: boolean;
  inWinnerCooldown: boolean;
  pointsByActivityType: Record<WeeklyScoreActivityType, number>;
  total: number;
  activeCategories: WeeklyScoreCategory[];
  hasMeaningfulOwnAction: boolean;
  candidate: boolean;
  candidateExclusionReasons: string[];
  rank: number | null;
  candidateRank: number | null;
  candidateThresholds: Record<
    '10' | '15' | '25',
    {
      candidate: boolean;
      rank: number | null;
      exclusionReasons: string[];
    }
  >;
};

export type WeeklyScoreIssue = {
  sourceTable: string;
  sourceId: string;
  userId?: string | null;
  reason: string;
};

export type WeeklyScoreOutput = {
  week: {
    timeZone: typeof COPENHAGEN_TIMEZONE;
    weekStartDate: string;
    weekEndDate: string;
    weekStartUtc: string;
    weekEndUtc: string;
  };
  users: WeeklyScoreUserSummary[];
  events: WeeklyScoreEvent[];
  mediaArticleProvenanceUncertain: WeeklyScoreIssue[];
  toggleRisks: WeeklyScoreIssue[];
  missingBusTripDataSources: WeeklyScoreIssue[];
  thresholds: [10, 15, 25];
};

type UserAccumulator = {
  userId: string;
  pointsByActivityType: Record<WeeklyScoreActivityType, number>;
  total: number;
  latestActivityAt: string | null;
  categories: Set<WeeklyScoreCategory>;
  hasMeaningfulOwnAction: boolean;
};

type MediaArticleClassification =
  | { shouldScore: true; reason: 'user_created_media_article' }
  | { shouldScore: false; reason: string; uncertain: boolean };

export const COPENHAGEN_TIMEZONE = 'Europe/Copenhagen';
export const POST_SCORE = 8;
export const COMMENT_SCORE = 2;
export const LIKE_GIVEN_SCORE = 1;
export const LIKE_RECEIVED_SCORE = 1;
export const POLL_VOTE_SCORE = 1;
export const RSVP_SCORE = 2;
export const FAN_ACTIVITY_REGISTRATION_SCORE = 4;
export const HOME_CHECKIN_SCORE = 10;
export const AWAY_CHECKIN_SCORE = 18;

export const DAILY_POST_CAP = 2;
export const DAILY_COMMENT_CAP = 10;
export const COMMENT_TARGET_24H_CAP = 3;
export const DAILY_LIKES_GIVEN_CAP = 5;
export const DAILY_POLL_VOTE_CAP = 3;
export const DAILY_RECEIVED_LIKES_CAP = 20;
export const POST_RECEIVED_LIKES_CAP = 5;
export const COMMENT_RECEIVED_LIKES_CAP = 3;
export const WEEKLY_TOP_FAN_COOLDOWN_DAYS = 21;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const ACTIVITY_TYPES: WeeklyScoreActivityType[] = [
  'post',
  'poll_post',
  'media_article',
  'comment',
  'reply',
  'like_given_post',
  'like_given_comment',
  'like_received_post',
  'like_received_comment',
  'poll_vote',
  'match_rsvp',
  'event_rsvp',
  'fan_activity_registration',
  'checkin_home',
  'checkin_away',
];
const QUALIFYING_FAN_ACTIVITY_REGISTRATION_STATUSES = new Set([
  'confirmed',
  'pending_verification',
]);

function emptyPointsByActivityType(): Record<WeeklyScoreActivityType, number> {
  return ACTIVITY_TYPES.reduce(
    (acc, type) => {
      acc[type] = 0;
      return acc;
    },
    {} as Record<WeeklyScoreActivityType, number>,
  );
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getCooldownStartDate(weekStartDate: string): string {
  return addDays(weekStartDate, -WEEKLY_TOP_FAN_COOLDOWN_DAYS);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values: Record<string, number> = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  });

  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  timeZone?: string;
}): Date {
  const {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
    timeZone = COPENHAGEN_TIMEZONE,
  } = input;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const initialOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let candidate = new Date(utcGuess - initialOffset);
  const correctedOffset = getTimeZoneOffsetMs(candidate, timeZone);

  if (correctedOffset !== initialOffset) {
    candidate = new Date(utcGuess - correctedOffset);
  }

  return candidate;
}

export function copenhagenDateToUtcIso(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  return zonedDateTimeToUtc({ year, month, day }).toISOString();
}

export function getCopenhagenDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COPENHAGEN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));

  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export function getCopenhagenWeekStartDate(baseDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COPENHAGEN_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(baseDate);

  const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Mon';
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
  const year = Number(parts.find((part) => part.type === 'year')?.value || '1970');
  const month = Number(parts.find((part) => part.type === 'month')?.value || '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value || '1');
  const localDate = new Date(Date.UTC(year, month - 1, day));
  localDate.setUTCDate(localDate.getUTCDate() - weekdayIndex);
  return localDate.toISOString().slice(0, 10);
}

export function buildCopenhagenWeekWindow(
  weekStartDate: string,
): WeeklyScoreInput['weekStartDate'] extends string
  ? {
      weekStartDate: string;
      weekEndDate: string;
      weekStartUtc: string;
      weekEndUtc: string;
    }
  : never {
  const weekEndDate = addDays(weekStartDate, 7);
  return {
    weekStartDate,
    weekEndDate,
    weekStartUtc: copenhagenDateToUtcIso(weekStartDate),
    weekEndUtc: copenhagenDateToUtcIso(weekEndDate),
  };
}

function isInWindow(iso: string, startIso: string, endIso: string): boolean {
  const value = Date.parse(iso);
  return Number.isFinite(value) && value >= Date.parse(startIso) && value < Date.parse(endIso);
}

function sortRowsByCreatedAtAsc<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

function normalizeTeamName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa');
}

function isFcnAwayFixture(fixture: WeeklyScoreFixtureRow | undefined): boolean {
  const away = normalizeTeamName(fixture?.away_team);
  const home = normalizeTeamName(fixture?.home_team);
  const awayMatches = FCN_TEAM_NAME_MATCHERS.some((matcher) => away.includes(matcher));
  const homeMatches = FCN_TEAM_NAME_MATCHERS.some((matcher) => home.includes(matcher));
  return awayMatches && !homeMatches;
}

function isPollPost(post: WeeklyScorePostRow): boolean {
  if (!post.poll_data) return false;
  if (typeof post.poll_data !== 'object') return true;
  const value = post.poll_data as { question?: unknown };
  return typeof value.question === 'string' ? value.question.trim().length > 0 : true;
}

function readPostType(post: WeeklyScorePostRow): string {
  return String(post.post_type || 'post').toLowerCase();
}

function readActorType(post: WeeklyScorePostRow): string {
  return String(post.actor_type || 'user').toLowerCase();
}

function classifyMediaArticleProvenance(input: {
  post: WeeklyScorePostRow;
  appAdminUserIds: Set<string>;
  mediaArticleCandidateByPostId: Map<string, WeeklyScoreMediaArticleCandidateRow>;
}): MediaArticleClassification {
  const { post, appAdminUserIds, mediaArticleCandidateByPostId } = input;
  const actorType = readActorType(post);
  const candidate = mediaArticleCandidateByPostId.get(post.id);

  if (!post.author_id) {
    return { shouldScore: false, reason: 'media_article_missing_author', uncertain: true };
  }

  if (actorType === 'community') {
    return { shouldScore: false, reason: 'community_media_article', uncertain: false };
  }

  if (candidate) {
    return { shouldScore: false, reason: 'media_article_candidate_approved', uncertain: false };
  }

  if (appAdminUserIds.has(post.author_id)) {
    return { shouldScore: false, reason: 'admin_or_system_media_article', uncertain: false };
  }

  if (actorType === 'user' && post.actor_id && post.actor_id === post.author_id) {
    return { shouldScore: true, reason: 'user_created_media_article' };
  }

  return { shouldScore: false, reason: 'media_article_provenance_uncertain', uncertain: true };
}

function eventTimeForMutableRow(row: { created_at: string; updated_at?: string | null }): string {
  return row.updated_at && Date.parse(row.updated_at) > Date.parse(row.created_at)
    ? row.updated_at
    : row.created_at;
}

function ensureAccumulator(users: Map<string, UserAccumulator>, userId: string): UserAccumulator {
  const existing = users.get(userId);
  if (existing) return existing;

  const next: UserAccumulator = {
    userId,
    pointsByActivityType: emptyPointsByActivityType(),
    total: 0,
    latestActivityAt: null,
    categories: new Set(),
    hasMeaningfulOwnAction: false,
  };
  users.set(userId, next);
  return next;
}

function rankUsers<T extends { userId: string; total: number; latestActivityAt?: string | null }>(
  rows: T[],
): Map<string, number> {
  const ranked = [...rows]
    .filter((row) => row.total > 0)
    .sort(
      (a, b) =>
        b.total - a.total ||
        Date.parse(b.latestActivityAt || '1970-01-01T00:00:00.000Z') -
          Date.parse(a.latestActivityAt || '1970-01-01T00:00:00.000Z') ||
        a.userId.localeCompare(b.userId),
    );
  return new Map(ranked.map((row, index) => [row.userId, index + 1]));
}

export function calculateWeeklyShadowScore(input: WeeklyScoreInput): WeeklyScoreOutput {
  const users = new Map<string, UserAccumulator>();
  const events: WeeklyScoreEvent[] = [];
  const mediaArticleProvenanceUncertain: WeeklyScoreIssue[] = [];
  const toggleRisks: WeeklyScoreIssue[] = [];
  const missingBusTripDataSources: WeeklyScoreIssue[] = [];
  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const appAdminUserIds = new Set(input.appAdminUserIds);
  const recentWinnerUserIds = new Set(input.recentWinnerUserIds);
  const postById = new Map(input.posts.map((post) => [post.id, post]));
  const commentById = new Map(input.comments.map((comment) => [comment.id, comment]));
  const fixtureById = new Map(input.fixtures.map((fixture) => [fixture.id, fixture]));
  const mediaArticleCandidateByPostId = new Map(
    (input.mediaArticleCandidates || [])
      .filter((candidate) => candidate.published_post_id)
      .map((candidate) => [candidate.published_post_id as string, candidate]),
  );

  const addScoreEvent = (
    event: WeeklyScoreEvent,
    category?: WeeklyScoreCategory,
    meaningful = false,
  ) => {
    events.push(event);
    const user = ensureAccumulator(users, event.userId);
    if (!event.counts) return;

    user.pointsByActivityType[event.activityType] += event.points;
    user.total += event.points;
    if (!user.latestActivityAt || user.latestActivityAt < event.occurredAt) {
      user.latestActivityAt = event.occurredAt;
    }
    if (category) {
      user.categories.add(category);
    }
    if (meaningful) {
      user.hasMeaningfulOwnAction = true;
    }
  };

  const acceptedPostsPerUserDay = new Map<string, number>();
  sortRowsByCreatedAtAsc(
    input.posts.filter((post) => isInWindow(post.created_at, input.weekStartUtc, input.weekEndUtc)),
  ).forEach((post) => {
    if (!post.author_id) return;

    const postType = readPostType(post);
    const actorType = readActorType(post);
    const isMediaArticle = postType === 'media_article';
    const isPoll = !isMediaArticle && isPollPost(post);
    const activityType: WeeklyScoreActivityType = isMediaArticle
      ? 'media_article'
      : isPoll
        ? 'poll_post'
        : 'post';
    let counts = true;
    let reason = isPoll ? 'poll_post_scored_as_post' : 'post_scored';

    if (actorType === 'community' && !isMediaArticle) {
      counts = false;
      reason = 'community_actor_post_no_personal_points';
    }

    if (isMediaArticle) {
      const classification = classifyMediaArticleProvenance({
        post,
        appAdminUserIds,
        mediaArticleCandidateByPostId,
      });
      counts = classification.shouldScore;
      reason = classification.reason;
      if (!classification.shouldScore && classification.uncertain) {
        mediaArticleProvenanceUncertain.push({
          sourceTable: 'posts',
          sourceId: post.id,
          userId: post.author_id,
          reason: classification.reason,
        });
      }
    }

    if (counts) {
      const dayKey = getCopenhagenDateKey(post.created_at);
      const userDayKey = `${post.author_id}:${dayKey}`;
      const acceptedForDay = acceptedPostsPerUserDay.get(userDayKey) || 0;
      if (acceptedForDay >= DAILY_POST_CAP) {
        counts = false;
        reason = 'daily_post_cap';
      } else {
        acceptedPostsPerUserDay.set(userDayKey, acceptedForDay + 1);
      }
    }

    addScoreEvent(
      {
        userId: post.author_id,
        sourceTable: 'posts',
        sourceId: post.id,
        occurredAt: post.created_at,
        activityType,
        targetType: postType,
        targetId: post.id,
        points: counts ? POST_SCORE : 0,
        counts,
        reason,
      },
      'post_or_poll',
      true,
    );
  });

  const acceptedCommentsPerUserDay = new Map<string, number>();
  const acceptedCommentTimestampsByUserTarget = new Map<string, number[]>();
  sortRowsByCreatedAtAsc(
    input.comments.filter((comment) =>
      isInWindow(comment.created_at, input.weekStartUtc, input.weekEndUtc),
    ),
  ).forEach((comment) => {
    if (!comment.author_id) return;
    const activityType: WeeklyScoreActivityType = comment.parent_id ? 'reply' : 'comment';
    const createdAtMs = Date.parse(comment.created_at);
    const dayKey = getCopenhagenDateKey(comment.created_at);
    const userDayKey = `${comment.author_id}:${dayKey}`;
    const userTargetKey = `${comment.author_id}:${comment.target_type}:${comment.target_id}`;
    const acceptedForDay = acceptedCommentsPerUserDay.get(userDayKey) || 0;
    let counts = true;
    let reason = activityType === 'reply' ? 'reply_scored' : 'comment_scored';

    if (acceptedForDay >= DAILY_COMMENT_CAP) {
      counts = false;
      reason = 'daily_comment_reply_cap';
    }

    const recentAccepted = (acceptedCommentTimestampsByUserTarget.get(userTargetKey) || []).filter(
      (timestamp) => createdAtMs - timestamp < ONE_DAY_MS,
    );
    if (counts && recentAccepted.length >= COMMENT_TARGET_24H_CAP) {
      counts = false;
      reason = 'comment_reply_target_24h_cap';
    }

    if (counts) {
      recentAccepted.push(createdAtMs);
      acceptedCommentsPerUserDay.set(userDayKey, acceptedForDay + 1);
    }
    acceptedCommentTimestampsByUserTarget.set(userTargetKey, recentAccepted);

    addScoreEvent(
      {
        userId: comment.author_id,
        sourceTable: 'comments_v2',
        sourceId: comment.id,
        occurredAt: comment.created_at,
        activityType,
        targetType: comment.target_type,
        targetId: comment.target_id,
        points: counts ? COMMENT_SCORE : 0,
        counts,
        reason,
      },
      'comment_or_reply',
      true,
    );
  });

  const acceptedLikesGivenPerUserDay = new Map<string, number>();
  const acceptedReceivedLikesPerUserDay = new Map<string, number>();
  const acceptedReceivedLikesPerTarget = new Map<string, number>();
  sortRowsByCreatedAtAsc(
    input.likes.filter((like) => isInWindow(like.created_at, input.weekStartUtc, input.weekEndUtc)),
  ).forEach((like) => {
    if (!like.user_id) return;
    if (like.target_type !== 'post' && like.target_type !== 'comment') return;

    const targetAuthorId =
      like.target_type === 'post'
        ? postById.get(like.target_id)?.author_id
        : commentById.get(like.target_id)?.author_id;
    const sourceId = like.id || `${like.user_id}:${like.target_type}:${like.target_id}`;
    const isSelfLike = !!targetAuthorId && targetAuthorId === like.user_id;
    const missingTarget = !targetAuthorId;
    const targetLabel = like.target_type === 'post' ? 'post' : 'comment';

    toggleRisks.push({
      sourceTable: 'likes_v2',
      sourceId,
      userId: like.user_id,
      reason: 'likes_v2_is_current_toggle_state_first_valid_like_uncertain',
    });

    let givenCounts = true;
    let givenReason = `like_given_${targetLabel}_scored`;
    if (missingTarget) {
      givenCounts = false;
      givenReason = 'like_target_missing';
    } else if (isSelfLike) {
      givenCounts = false;
      givenReason = 'self_like';
    }

    if (givenCounts) {
      const dayKey = getCopenhagenDateKey(like.created_at);
      const userDayKey = `${like.user_id}:${dayKey}`;
      const acceptedForDay = acceptedLikesGivenPerUserDay.get(userDayKey) || 0;
      if (acceptedForDay >= DAILY_LIKES_GIVEN_CAP) {
        givenCounts = false;
        givenReason = 'daily_likes_given_cap';
      } else {
        acceptedLikesGivenPerUserDay.set(userDayKey, acceptedForDay + 1);
      }
    }

    addScoreEvent(
      {
        userId: like.user_id,
        sourceTable: 'likes_v2',
        sourceId,
        occurredAt: like.created_at,
        activityType: like.target_type === 'post' ? 'like_given_post' : 'like_given_comment',
        targetType: like.target_type,
        targetId: like.target_id,
        points: givenCounts ? LIKE_GIVEN_SCORE : 0,
        counts: givenCounts,
        reason: givenReason,
      },
      'likes_given',
      false,
    );

    if (!targetAuthorId) return;
    let receivedCounts = !isSelfLike;
    let receivedReason = isSelfLike ? 'self_like' : `like_received_${targetLabel}_scored`;
    if (receivedCounts) {
      const dayKey = getCopenhagenDateKey(like.created_at);
      const userDayKey = `${targetAuthorId}:${dayKey}`;
      const targetKey = `${like.target_type}:${like.target_id}`;
      const acceptedForDay = acceptedReceivedLikesPerUserDay.get(userDayKey) || 0;
      const acceptedForTarget = acceptedReceivedLikesPerTarget.get(targetKey) || 0;
      const targetCap =
        like.target_type === 'post' ? POST_RECEIVED_LIKES_CAP : COMMENT_RECEIVED_LIKES_CAP;

      if (acceptedForDay >= DAILY_RECEIVED_LIKES_CAP) {
        receivedCounts = false;
        receivedReason = 'daily_received_likes_cap';
      } else if (acceptedForTarget >= targetCap) {
        receivedCounts = false;
        receivedReason =
          like.target_type === 'post' ? 'post_received_likes_cap' : 'comment_received_likes_cap';
      } else {
        acceptedReceivedLikesPerUserDay.set(userDayKey, acceptedForDay + 1);
        acceptedReceivedLikesPerTarget.set(targetKey, acceptedForTarget + 1);
      }
    }

    addScoreEvent(
      {
        userId: targetAuthorId,
        sourceTable: 'likes_v2',
        sourceId,
        occurredAt: like.created_at,
        activityType: like.target_type === 'post' ? 'like_received_post' : 'like_received_comment',
        targetType: like.target_type,
        targetId: like.target_id,
        points: receivedCounts ? LIKE_RECEIVED_SCORE : 0,
        counts: receivedCounts,
        reason: receivedReason,
      },
      'likes_received',
      false,
    );
  });

  const acceptedPollVotesPerUserDay = new Map<string, number>();
  const acceptedPollVotes = new Set<string>();
  sortRowsByCreatedAtAsc(
    input.pollVotes.filter((vote) =>
      isInWindow(vote.created_at, input.weekStartUtc, input.weekEndUtc),
    ),
  ).forEach((vote) => {
    if (!vote.user_id) return;
    const sourceId = vote.id || `${vote.user_id}:${vote.post_id}:${vote.option_id}`;
    const post = postById.get(vote.post_id);
    const uniqueVoteKey = `${vote.user_id}:${vote.post_id}`;
    let counts = true;
    let reason = 'poll_vote_scored';

    if (!post) {
      counts = false;
      reason = 'poll_post_missing';
    } else if (post.author_id === vote.user_id) {
      counts = false;
      reason = 'own_poll_vote';
    } else if (acceptedPollVotes.has(uniqueVoteKey)) {
      counts = false;
      reason = 'duplicate_poll_vote';
    }

    if (counts) {
      const dayKey = getCopenhagenDateKey(vote.created_at);
      const userDayKey = `${vote.user_id}:${dayKey}`;
      const acceptedForDay = acceptedPollVotesPerUserDay.get(userDayKey) || 0;
      if (acceptedForDay >= DAILY_POLL_VOTE_CAP) {
        counts = false;
        reason = 'daily_poll_vote_cap';
      } else {
        acceptedPollVotesPerUserDay.set(userDayKey, acceptedForDay + 1);
        acceptedPollVotes.add(uniqueVoteKey);
      }
    }

    addScoreEvent(
      {
        userId: vote.user_id,
        sourceTable: 'poll_votes',
        sourceId,
        occurredAt: vote.created_at,
        activityType: 'poll_vote',
        targetType: 'post',
        targetId: vote.post_id,
        points: counts ? POLL_VOTE_SCORE : 0,
        counts,
        reason,
      },
      'poll_vote',
      true,
    );
  });

  const acceptedRsvps = new Set<string>();
  input.rsvps
    .filter((rsvp) =>
      isInWindow(eventTimeForMutableRow(rsvp), input.weekStartUtc, input.weekEndUtc),
    )
    .sort((a, b) => Date.parse(eventTimeForMutableRow(a)) - Date.parse(eventTimeForMutableRow(b)))
    .forEach((rsvp) => {
      if (!rsvp.user_id) return;
      const sourceId = rsvp.id || `${rsvp.user_id}:${rsvp.entity_type}:${rsvp.entity_id}`;
      const occurredAt = eventTimeForMutableRow(rsvp);
      toggleRisks.push({
        sourceTable: 'rsvps',
        sourceId,
        userId: rsvp.user_id,
        reason: 'rsvps_is_mutable_toggle_state_first_going_transition_uncertain',
      });

      if (rsvp.entity_type !== 'match' && rsvp.entity_type !== 'event') {
        return;
      }

      const uniqueRsvpKey = `${rsvp.user_id}:${rsvp.entity_type}:${rsvp.entity_id}`;
      let counts = rsvp.status === 'going';
      let reason = counts ? `${rsvp.entity_type}_rsvp_going_scored` : 'rsvp_status_not_going';

      if (counts && acceptedRsvps.has(uniqueRsvpKey)) {
        counts = false;
        reason = 'duplicate_rsvp';
      }

      if (counts) {
        acceptedRsvps.add(uniqueRsvpKey);
      }

      addScoreEvent(
        {
          userId: rsvp.user_id,
          sourceTable: 'rsvps',
          sourceId,
          occurredAt,
          activityType: rsvp.entity_type === 'match' ? 'match_rsvp' : 'event_rsvp',
          targetType: rsvp.entity_type,
          targetId: rsvp.entity_id,
          points: counts ? RSVP_SCORE : 0,
          counts,
          reason,
        },
        'participation',
        true,
      );
    });

  const acceptedFanActivityRegistrations = new Set<string>();
  input.fanActivityRegistrations
    .filter((registration) =>
      isInWindow(eventTimeForMutableRow(registration), input.weekStartUtc, input.weekEndUtc),
    )
    .sort((a, b) => Date.parse(eventTimeForMutableRow(a)) - Date.parse(eventTimeForMutableRow(b)))
    .forEach((registration) => {
      if (!registration.user_id) return;
      const occurredAt = eventTimeForMutableRow(registration);
      const uniqueKey = `${registration.user_id}:${registration.fan_activity_id}`;
      let counts = QUALIFYING_FAN_ACTIVITY_REGISTRATION_STATUSES.has(registration.status);
      let reason = counts
        ? 'fan_activity_registration_scored'
        : 'fan_activity_registration_status_not_qualifying';

      if (counts && acceptedFanActivityRegistrations.has(uniqueKey)) {
        counts = false;
        reason = 'duplicate_fan_activity_registration';
      }

      if (counts) {
        acceptedFanActivityRegistrations.add(uniqueKey);
      }

      addScoreEvent(
        {
          userId: registration.user_id,
          sourceTable: 'fan_activity_registrations',
          sourceId: registration.id,
          occurredAt,
          activityType: 'fan_activity_registration',
          targetType: 'fan_activity',
          targetId: registration.fan_activity_id,
          points: counts ? FAN_ACTIVITY_REGISTRATION_SCORE : 0,
          counts,
          reason,
        },
        'participation',
        true,
      );
    });

  const acceptedCheckIns = new Set<string>();
  sortRowsByCreatedAtAsc(
    input.matchCheckins.filter((checkin) =>
      isInWindow(checkin.created_at, input.weekStartUtc, input.weekEndUtc),
    ),
  ).forEach((checkin) => {
    if (!checkin.user_id) return;
    const uniqueCheckInKey = `${checkin.user_id}:${checkin.match_id}`;
    let counts = true;
    let reason = 'match_checkin_scored';

    if (acceptedCheckIns.has(uniqueCheckInKey)) {
      counts = false;
      reason = 'duplicate_match_checkin';
    }

    if (counts) {
      acceptedCheckIns.add(uniqueCheckInKey);
    }

    const fixture = fixtureById.get(checkin.match_id);
    const isAway = isFcnAwayFixture(fixture);
    const points = isAway ? AWAY_CHECKIN_SCORE : HOME_CHECKIN_SCORE;
    if (!fixture && counts) {
      reason = 'match_checkin_scored_fixture_missing_home_default';
    }

    addScoreEvent(
      {
        userId: checkin.user_id,
        sourceTable: 'match_checkins',
        sourceId: checkin.id || `${checkin.user_id}:${checkin.match_id}`,
        occurredAt: checkin.created_at,
        activityType: isAway ? 'checkin_away' : 'checkin_home',
        targetType: 'match',
        targetId: checkin.match_id,
        points: counts ? points : 0,
        counts,
        reason,
      },
      'checkin',
      true,
    );
  });

  (input.busTripSignals || [])
    .filter((signal) => signal.target_type === 'bus_trip')
    .filter((signal) =>
      isInWindow(eventTimeForMutableRow(signal), input.weekStartUtc, input.weekEndUtc),
    )
    .forEach((signal) => {
      missingBusTripDataSources.push({
        sourceTable: 'user_upcoming_items',
        sourceId: signal.id,
        userId: signal.user_id,
        reason: 'bus_trip_points_not_implemented_no_reliable_booking_registration_source',
      });
    });

  const rawSummaries = Array.from(users.values()).map((user) => {
    const profile = profileById.get(user.userId);
    const hasProfile = !!profile;
    const isAdmin = appAdminUserIds.has(user.userId);
    const inWinnerCooldown = recentWinnerUserIds.has(user.userId);
    const activeCategories = Array.from(user.categories).sort();
    const baseExclusionReasons: string[] = [];

    if (isAdmin) baseExclusionReasons.push('admin_or_systemadmin');
    if (!hasProfile) baseExclusionReasons.push('missing_profile');
    if (activeCategories.length < 2) baseExclusionReasons.push('not_enough_active_categories');
    if (!user.hasMeaningfulOwnAction) baseExclusionReasons.push('missing_meaningful_own_action');
    if (inWinnerCooldown) baseExclusionReasons.push('weekly_top_fan_cooldown');

    return {
      userId: user.userId,
      displayName: profile?.display_name || profile?.username || null,
      hasProfile,
      isAdmin,
      inWinnerCooldown,
      pointsByActivityType: user.pointsByActivityType,
      total: user.total,
      latestActivityAt: user.latestActivityAt,
      activeCategories,
      hasMeaningfulOwnAction: user.hasMeaningfulOwnAction,
      candidate: baseExclusionReasons.length === 0,
      candidateExclusionReasons: baseExclusionReasons,
      rank: null,
      candidateRank: null,
      candidateThresholds: {
        '10': { candidate: false, rank: null, exclusionReasons: [] },
        '15': { candidate: false, rank: null, exclusionReasons: [] },
        '25': { candidate: false, rank: null, exclusionReasons: [] },
      },
    };
  });

  const allRanks = rankUsers(rawSummaries);
  const baseCandidateRanks = rankUsers(rawSummaries.filter((summary) => summary.candidate));
  const thresholdRanks = {
    10: rankUsers(rawSummaries.filter((summary) => summary.candidate && summary.total >= 10)),
    15: rankUsers(rawSummaries.filter((summary) => summary.candidate && summary.total >= 15)),
    25: rankUsers(rawSummaries.filter((summary) => summary.candidate && summary.total >= 25)),
  };

  const usersOutput: WeeklyScoreUserSummary[] = rawSummaries
    .map((summary) => {
      const candidateThresholds = ([10, 15, 25] as const).reduce(
        (acc, threshold) => {
          const thresholdReasons = [...summary.candidateExclusionReasons];
          if (summary.total < threshold) {
            thresholdReasons.push(`below_${threshold}_point_threshold`);
          }
          acc[String(threshold) as '10' | '15' | '25'] = {
            candidate: thresholdReasons.length === 0,
            rank: thresholdRanks[threshold].get(summary.userId) ?? null,
            exclusionReasons: thresholdReasons,
          };
          return acc;
        },
        {} as WeeklyScoreUserSummary['candidateThresholds'],
      );

      return {
        userId: summary.userId,
        displayName: summary.displayName,
        hasProfile: summary.hasProfile,
        isAdmin: summary.isAdmin,
        inWinnerCooldown: summary.inWinnerCooldown,
        pointsByActivityType: summary.pointsByActivityType,
        total: summary.total,
        activeCategories: summary.activeCategories,
        hasMeaningfulOwnAction: summary.hasMeaningfulOwnAction,
        candidate: summary.candidate,
        candidateExclusionReasons: summary.candidateExclusionReasons,
        rank: allRanks.get(summary.userId) ?? null,
        candidateRank: baseCandidateRanks.get(summary.userId) ?? null,
        candidateThresholds,
      };
    })
    .sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER));

  return {
    week: {
      timeZone: COPENHAGEN_TIMEZONE,
      weekStartDate: input.weekStartDate,
      weekEndDate: input.weekEndDate,
      weekStartUtc: input.weekStartUtc,
      weekEndUtc: input.weekEndUtc,
    },
    users: usersOutput,
    events: input.includeDetails ? events : [],
    mediaArticleProvenanceUncertain,
    toggleRisks,
    missingBusTripDataSources:
      missingBusTripDataSources.length > 0
        ? missingBusTripDataSources
        : [
            {
              sourceTable: 'bus_trips',
              sourceId: '*',
              reason: 'bus_trip_points_not_implemented_no_reliable_booking_registration_source',
            },
          ],
    thresholds: [10, 15, 25],
  };
}
