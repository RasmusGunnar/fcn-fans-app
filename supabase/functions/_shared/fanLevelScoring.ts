export type FanLevelKey =
  | 'new_fan'
  | 'community_member'
  | 'regular_voice'
  | 'community_core'
  | 'dedicated'
  | 'top_fan';

export type ProfileRow = {
  id: string;
  fan_level_key: FanLevelKey | null;
};

export type PostRow = {
  id: string;
  author_id: string | null;
  created_at: string;
  post_type?: string | null;
  actor_type?: string | null;
};

export type CommentRow = {
  id: string;
  author_id: string | null;
  target_type: string;
  target_id: string;
  created_at: string;
};

export type LikeRow = {
  user_id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  created_at: string;
};

export type MatchCheckInRow = {
  match_id: string;
  user_id: string | null;
  created_at: string;
};

export type FixtureRow = {
  id: string;
  home_team: string | null;
  away_team: string | null;
};

export type FanLevelScoreInput = {
  profiles: ProfileRow[];
  posts: PostRow[];
  comments: CommentRow[];
  likes: LikeRow[];
  checkins: MatchCheckInRow[];
  fixtures: FixtureRow[];
};

export const POST_SCORE = 8;
export const COMMENT_SCORE = 2;
export const LIKE_RECEIVED_SCORE = 1;
export const HOME_CHECKIN_SCORE = 10;
export const AWAY_CHECKIN_SCORE = 18;
export const DAILY_POST_CAP = 2;
export const DAILY_COMMENT_CAP = 10;
export const COMMENT_TARGET_24H_CAP = 3;
export const DAILY_RECEIVED_LIKES_CAP = 20;
export const POST_RECEIVED_LIKES_CAP = 5;
export const COMMENT_RECEIVED_LIKES_CAP = 3;

const COPENHAGEN_TIMEZONE = 'Europe/Copenhagen';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const DANISH_MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00c3\u00a6/g, 'ae'],
  [/\u00c3\u00b8/g, 'o'],
  [/\u00c3\u00a5/g, 'a'],
];

export const FAN_LEVEL_THRESHOLDS: { minScore: number; level: FanLevelKey }[] = [
  { minScore: 1300, level: 'top_fan' },
  { minScore: 850, level: 'dedicated' },
  { minScore: 500, level: 'community_core' },
  { minScore: 250, level: 'regular_voice' },
  { minScore: 100, level: 'community_member' },
  { minScore: 0, level: 'new_fan' },
];

export function isFanLevelKey(value: unknown): value is FanLevelKey {
  return (
    value === 'new_fan' ||
    value === 'community_member' ||
    value === 'regular_voice' ||
    value === 'community_core' ||
    value === 'dedicated' ||
    value === 'top_fan'
  );
}

export function getFanLevelForScore(score: number): FanLevelKey {
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return (
    FAN_LEVEL_THRESHOLDS.find((threshold) => normalizedScore >= threshold.minScore)?.level ||
    'new_fan'
  );
}

function readFormatterParts(date: Date, timeZone: string): Record<string, string> {
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
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
}

function getCopenhagenDateKey(value: string): string {
  const parts = readFormatterParts(new Date(value), COPENHAGEN_TIMEZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function replaceDanishMojibake(value: string): string {
  return DANISH_MOJIBAKE_REPLACEMENTS.reduce(
    (normalizedValue, [pattern, replacement]) => normalizedValue.replace(pattern, replacement),
    value,
  );
}

function normalizeTeamName(value: string | null | undefined): string {
  return replaceDanishMojibake(String(value || ''))
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a');
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

function isPersonalPostCreationActivity(post: PostRow): boolean {
  const postType = String(post.post_type || '').toLowerCase();
  const actorType = String(post.actor_type || '').toLowerCase();
  return postType !== 'media_article' && actorType !== 'community';
}

export function calculateFanLevelScores(input: FanLevelScoreInput): {
  scores: Map<string, number>;
  activityUsersWithoutProfile: Set<string>;
} {
  const profileIds = new Set(input.profiles.map((profile) => profile.id));
  const postAuthorById = new Map<string, string>();
  const commentAuthorById = new Map<string, string>();
  const scores = new Map<string, number>();
  const activityUsersWithoutProfile = new Set<string>();

  input.profiles.forEach((profile) => {
    scores.set(profile.id, 0);
  });

  const addScore = (userId: string | null | undefined, value: number) => {
    if (!userId) return;

    if (!profileIds.has(userId)) {
      activityUsersWithoutProfile.add(userId);
      return;
    }

    scores.set(userId, (scores.get(userId) || 0) + value);
  };

  input.posts.forEach((post) => {
    if (post.id && post.author_id) {
      postAuthorById.set(post.id, post.author_id);
    }
  });

  input.comments.forEach((comment) => {
    if (comment.id && comment.author_id) {
      commentAuthorById.set(comment.id, comment.author_id);
    }
  });

  const fixturesById = new Map<string, FixtureRow>();
  input.fixtures.forEach((fixture) => {
    fixturesById.set(fixture.id, fixture);
  });

  const acceptedPostsPerUserDay = new Map<string, number>();
  sortRowsByCreatedAtAsc(input.posts).forEach((post) => {
    if (!isPersonalPostCreationActivity(post)) {
      return;
    }

    const dayKey = getCopenhagenDateKey(post.created_at);
    const userDayKey = `${post.author_id}:${dayKey}`;
    const acceptedCount = acceptedPostsPerUserDay.get(userDayKey) || 0;

    if (acceptedCount >= DAILY_POST_CAP) {
      return;
    }

    acceptedPostsPerUserDay.set(userDayKey, acceptedCount + 1);
    addScore(post.author_id, POST_SCORE);
  });

  const acceptedCommentsPerUserDay = new Map<string, number>();
  const acceptedCommentTimestampsByUserTarget = new Map<string, number[]>();
  sortRowsByCreatedAtAsc(input.comments).forEach((comment) => {
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
    addScore(comment.author_id, COMMENT_SCORE);
  });

  const acceptedReceivedLikesPerUserDay = new Map<string, number>();
  const acceptedReceivedLikesPerTarget = new Map<string, number>();
  sortRowsByCreatedAtAsc(input.likes).forEach((like) => {
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
    addScore(targetAuthorId, LIKE_RECEIVED_SCORE);
  });

  const acceptedCheckIns = new Set<string>();
  sortRowsByCreatedAtAsc(input.checkins).forEach((checkin) => {
    const uniqueCheckInKey = `${checkin.user_id}:${checkin.match_id}`;
    if (acceptedCheckIns.has(uniqueCheckInKey)) {
      return;
    }

    acceptedCheckIns.add(uniqueCheckInKey);

    const fixture = fixturesById.get(checkin.match_id);
    const points = isFcnAwayFixture(fixture) ? AWAY_CHECKIN_SCORE : HOME_CHECKIN_SCORE;
    addScore(checkin.user_id, points);
  });

  return { scores, activityUsersWithoutProfile };
}
