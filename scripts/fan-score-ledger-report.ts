import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type SourceTable =
  | 'posts'
  | 'comments_v2'
  | 'likes_v2'
  | 'poll_votes'
  | 'rsvps'
  | 'match_checkins'
  | 'fan_activity_registrations';

type CliOptions = {
  since?: string;
  until?: string;
  includeDetails: boolean;
};

type ReportCheckpointStatus = 'started' | 'ok' | 'failed' | 'skipped';

type ReportCheckpoint = {
  phase: string;
  status: ReportCheckpointStatus;
  startedAt: string;
  finishedAt?: string;
  rowCount?: number;
  reason?: string;
};

type SafeSerializedError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: string | number;
  phase?: string;
};

type LedgerEventRow = {
  id: string;
  user_id: string;
  activity_type: string;
  source_table: SourceTable;
  source_id: string;
  target_type: string | null;
  target_id: string | null;
  target_owner_user_id: string | null;
  occurred_at: string;
  cph_week_start: string;
  cph_day: string;
  base_points: number;
  category: string;
  meaningful_own_action: boolean;
  dedupe_key: string;
  metadata: Record<string, unknown> | null;
  revoked_at: string | null;
};

type PostRow = {
  id: string;
  author_id: string | null;
  created_at: string;
  post_type: string | null;
  actor_type: string | null;
  actor_id: string | null;
  poll_data: unknown | null;
  media_article_provenance?: string | null;
};

type CommentRow = {
  id: string;
  author_id: string | null;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  parent_id: string | null;
};

type LikeRow = {
  id: string;
  user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
};

type PollVoteRow = {
  id: string;
  post_id: string | null;
  option_id: string | null;
  user_id: string | null;
  created_at: string;
};

type RsvpRow = {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  status: string | null;
  created_at: string;
};

type MatchCheckinRow = {
  id: string;
  match_id: string | null;
  user_id: string | null;
  created_at: string;
};

type FixtureRow = {
  id: string;
  home_team: string | null;
  away_team: string | null;
};

type FanActivityRegistrationRow = {
  id: string;
  fan_activity_id: string | null;
  user_id: string | null;
  status: string | null;
  created_at: string;
};

type ExpectedCaptureEvent = {
  sourceTable: SourceTable;
  sourceId: string;
  dedupeKey: string;
  activityType: string;
  category: string;
  basePoints: number;
  userId: string;
  occurredAt: string;
  excludedReason?: string;
};

type CaptureSourceSummary = {
  sourceTable: SourceTable;
  sourceRows: number;
  expectedLedgerEvents: number;
  foundLedgerEventsInPeriod: number;
  alreadyDedupedOutsidePeriod: number;
  obviousMissing: number;
  excluded: Record<string, number>;
};

type LedgerOverview = {
  eventCount: number;
  uniqueUsers: number;
  byActivityType: Record<string, number>;
  byCategory: Record<string, number>;
  meaningfulOwnActionEvents: number;
  byCphDay: Record<string, number>;
  byCphWeek: Record<string, number>;
};

type DedupeOverview = {
  uniqueDedupeKeys: number;
  duplicateDedupeKeys: { dedupeKeyHash: string; count: number }[];
  repeatedLikeGroupsWithSingleLedgerEvent: number;
  repeatedRsvpGroupsWithSingleLedgerEvent: number;
};

type PseudonymizedDetail = {
  user: string;
  sourceTable: SourceTable;
  sourceRef: string;
  activityType: string;
  occurredAt: string;
  points: number;
  dedupeStatus: 'found_in_period' | 'already_deduped_outside_period' | 'missing' | 'excluded';
  reason: string;
};

type ReportInput = {
  ledgerEvents: LedgerEventRow[];
  allTimeLedgerForExpectedKeys: LedgerEventRow[];
  posts: PostRow[];
  comments: CommentRow[];
  likes: LikeRow[];
  pollVotes: PollVoteRow[];
  rsvps: RsvpRow[];
  matchCheckins: MatchCheckinRow[];
  fanActivityRegistrations: FanActivityRegistrationRow[];
  targetPosts: PostRow[];
  targetComments: CommentRow[];
  pollPosts: PostRow[];
  fixtures: FixtureRow[];
  appAdminUserIds: string[];
  includeDetails: boolean;
};

type Report = {
  ok: true;
  generatedAt: string;
  period: { since: string; until: string };
  readOnly: true;
  safety: {
    onlySelectQueries: true;
    noSecretsLogged: true;
    rawUserIdsInStandardOutput: false;
    liveRankingFlowsReadLedger: false;
  };
  checkpoints: ReportCheckpoint[];
  ledgerOverview: LedgerOverview;
  captureOverview: CaptureSourceSummary[];
  dedupeOverview: DedupeOverview;
  details?: PseudonymizedDetail[];
  notes: string[];
};

const SOURCE_TABLES: SourceTable[] = [
  'posts',
  'comments_v2',
  'likes_v2',
  'poll_votes',
  'rsvps',
  'match_checkins',
  'fan_activity_registrations',
];

let currentCheckpoints: ReportCheckpoint[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readSafePrimitiveField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function readSafeStatusField(record: Record<string, unknown>): string | number | undefined {
  const value = record.status ?? record.statusCode;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 100);
  return undefined;
}

function serializeError(error: unknown, phase?: string): SafeSerializedError {
  if (error instanceof LedgerReportError) return error.safe;

  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>;
    const serialized: SafeSerializedError = {
      message: error.message || 'Unknown Error',
      phase,
    };
    const code = readSafePrimitiveField(record, 'code');
    const details = readSafePrimitiveField(record, 'details');
    const hint = readSafePrimitiveField(record, 'hint');
    const status = readSafeStatusField(record);
    if (code) serialized.code = code;
    if (details) serialized.details = details;
    if (hint) serialized.hint = hint;
    if (status !== undefined) serialized.status = status;
    return serialized;
  }

  if (isRecord(error)) {
    const message =
      readSafePrimitiveField(error, 'message') ||
      readSafePrimitiveField(error, 'error_description') ||
      readSafePrimitiveField(error, 'error') ||
      'Non-Error object thrown';
    const serialized: SafeSerializedError = { message, phase };
    const code = readSafePrimitiveField(error, 'code');
    const details = readSafePrimitiveField(error, 'details');
    const hint = readSafePrimitiveField(error, 'hint');
    const status = readSafeStatusField(error);
    if (code) serialized.code = code;
    if (details) serialized.details = details;
    if (hint) serialized.hint = hint;
    if (status !== undefined) serialized.status = status;
    return serialized;
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown thrown value',
    phase,
  };
}

class LedgerReportError extends Error {
  readonly safe: SafeSerializedError;

  constructor(
    readonly phase: string,
    cause: unknown,
  ) {
    const safe = serializeError(cause, phase);
    super(safe.message);
    this.name = 'LedgerReportError';
    this.safe = safe;
  }
}

function startCheckpoint(checkpoints: ReportCheckpoint[], phase: string): ReportCheckpoint {
  const checkpoint: ReportCheckpoint = {
    phase,
    status: 'started',
    startedAt: new Date().toISOString(),
  };
  checkpoints.push(checkpoint);
  return checkpoint;
}

function finishCheckpoint(
  checkpoint: ReportCheckpoint,
  status: Exclude<ReportCheckpointStatus, 'started'>,
  details: { rowCount?: number; reason?: string } = {},
): void {
  checkpoint.status = status;
  checkpoint.finishedAt = new Date().toISOString();
  if (details.rowCount !== undefined) checkpoint.rowCount = details.rowCount;
  if (details.reason) checkpoint.reason = details.reason;
}

function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) return;
    const [, key, rawValue] = match;
    if (process.env[key]) return;
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  });
}

function assertIsoTimestamp(value: string, label: string): void {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }
}

export function parseArgs(argv: string[], now = new Date()): CliOptions {
  const options: CliOptions = { includeDetails: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--includeDetails' || arg === '--includeDetails=true') {
      options.includeDetails = true;
    } else if (arg === '--since') {
      const value = argv[index + 1];
      if (!value) throw new Error('--since requires an ISO timestamp');
      options.since = value;
      index += 1;
    } else if (arg.startsWith('--since=')) {
      options.since = arg.slice('--since='.length);
    } else if (arg === '--until') {
      const value = argv[index + 1];
      if (!value) throw new Error('--until requires an ISO timestamp');
      options.until = value;
      index += 1;
    } else if (arg.startsWith('--until=')) {
      options.until = arg.slice('--until='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.since) {
    options.since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (!options.until) {
    options.until = now.toISOString();
  }

  assertIsoTimestamp(options.since, 'since');
  assertIsoTimestamp(options.until, 'until');
  if (new Date(options.since).getTime() >= new Date(options.until).getTime()) {
    throw new Error('since must be before until');
  }

  return options;
}

function increment(map: Record<string, number>, key: string | null | undefined, amount = 1): void {
  const safeKey = key && key.trim().length > 0 ? key : '<unknown>';
  map[safeKey] = (map[safeKey] || 0) + amount;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function createPseudonymizer(): (userId: string | null | undefined) => string {
  const labels = new Map<string, string>();

  return (userId: string | null | undefined) => {
    if (!userId) return 'Unknown User';
    const existing = labels.get(userId);
    if (existing) return existing;
    const label = `User ${String.fromCharCode(65 + (labels.size % 26))}${
      labels.size >= 26 ? Math.floor(labels.size / 26) : ''
    }`;
    labels.set(userId, label);
    return label;
  };
}

export function buildLedgerOverview(events: LedgerEventRow[]): LedgerOverview {
  const byActivityType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byCphDay: Record<string, number> = {};
  const byCphWeek: Record<string, number> = {};
  const users = new Set<string>();
  let meaningfulOwnActionEvents = 0;

  events.forEach((event) => {
    users.add(event.user_id);
    increment(byActivityType, event.activity_type);
    increment(byCategory, event.category);
    increment(byCphDay, event.cph_day);
    increment(byCphWeek, event.cph_week_start);
    if (event.meaningful_own_action) meaningfulOwnActionEvents += 1;
  });

  return {
    eventCount: events.length,
    uniqueUsers: users.size,
    byActivityType,
    byCategory,
    meaningfulOwnActionEvents,
    byCphDay,
    byCphWeek,
  };
}

function isAdmin(userId: string | null | undefined, appAdminUserIds: Set<string>): boolean {
  return !!userId && appAdminUserIds.has(userId);
}

function getPostType(post: PostRow): string {
  return String(post.post_type || 'post').toLowerCase();
}

function getActorType(post: PostRow): string {
  return String(post.actor_type || 'user').toLowerCase();
}

function addExpectedOrExcluded(
  expected: ExpectedCaptureEvent[],
  event: Omit<ExpectedCaptureEvent, 'excludedReason'>,
  excludedReason?: string,
): void {
  expected.push(excludedReason ? { ...event, excludedReason } : event);
}

function buildExpectedPostEvents(
  rows: PostRow[],
  appAdminUserIds: Set<string>,
): ExpectedCaptureEvent[] {
  return rows.map((post) => {
    const postType = getPostType(post);
    const actorType = getActorType(post);
    let activityType =
      post.poll_data !== null && post.poll_data !== undefined ? 'poll_post' : 'post';
    let excludedReason: string | undefined;

    if (!post.author_id) excludedReason = 'missing_author';
    else if (isAdmin(post.author_id, appAdminUserIds)) excludedReason = 'admin_author';
    else if (postType === 'media_article') {
      if (post.media_article_provenance !== 'user_submitted') {
        excludedReason = 'media_article_not_user_submitted';
      }
      activityType = 'media_article';
    } else if (actorType === 'community') {
      excludedReason = 'community_actor_post';
    }

    return {
      sourceTable: 'posts',
      sourceId: post.id,
      dedupeKey: `post:${post.id}:${post.author_id || '<missing_author>'}`,
      activityType,
      category: 'post_or_poll',
      basePoints: 8,
      userId: post.author_id || '<missing_author>',
      occurredAt: post.created_at,
      excludedReason,
    };
  });
}

function buildExpectedCommentEvents(
  rows: CommentRow[],
  appAdminUserIds: Set<string>,
): ExpectedCaptureEvent[] {
  return rows.map((comment) => {
    const excludedReason = !comment.author_id
      ? 'missing_author'
      : isAdmin(comment.author_id, appAdminUserIds)
        ? 'admin_author'
        : undefined;

    return {
      sourceTable: 'comments_v2',
      sourceId: comment.id,
      dedupeKey: `comment:${comment.id}:${comment.author_id || '<missing_author>'}`,
      activityType: comment.parent_id ? 'reply' : 'comment',
      category: 'comment_or_reply',
      basePoints: 2,
      userId: comment.author_id || '<missing_author>',
      occurredAt: comment.created_at,
      excludedReason,
    };
  });
}

function buildExpectedLikeEvents(
  likes: LikeRow[],
  targetPosts: PostRow[],
  targetComments: CommentRow[],
  appAdminUserIds: Set<string>,
): ExpectedCaptureEvent[] {
  const postOwners = new Map(targetPosts.map((post) => [post.id, post.author_id]));
  const commentOwners = new Map(targetComments.map((comment) => [comment.id, comment.author_id]));
  const expected: ExpectedCaptureEvent[] = [];

  likes.forEach((like) => {
    const targetType = String(like.target_type || '').toLowerCase();
    const targetOwner =
      targetType === 'post'
        ? postOwners.get(like.target_id || '')
        : targetType === 'comment'
          ? commentOwners.get(like.target_id || '')
          : undefined;
    const base = {
      sourceTable: 'likes_v2' as const,
      sourceId: like.id,
      category: 'likes_given',
      basePoints: 1,
      userId: like.user_id || '<missing_user>',
      occurredAt: like.created_at,
    };

    if (!like.user_id) {
      addExpectedOrExcluded(
        expected,
        {
          ...base,
          dedupeKey: `like_given:${targetType || '<unknown>'}:${like.target_id || '<missing_target>'}:<missing_user>`,
          activityType: `like_given_${targetType || 'unknown'}`,
        },
        'missing_user',
      );
      return;
    }

    if (isAdmin(like.user_id, appAdminUserIds)) {
      addExpectedOrExcluded(
        expected,
        {
          ...base,
          dedupeKey: `like_given:${targetType}:${like.target_id || '<missing_target>'}:${like.user_id}`,
          activityType: `like_given_${targetType || 'unknown'}`,
        },
        'admin_liker',
      );
      return;
    }

    if (!['post', 'comment'].includes(targetType)) {
      addExpectedOrExcluded(
        expected,
        {
          ...base,
          dedupeKey: `like_given:${targetType || '<unknown>'}:${like.target_id || '<missing_target>'}:${like.user_id}`,
          activityType: `like_given_${targetType || 'unknown'}`,
        },
        'unsupported_like_target_type',
      );
      return;
    }

    if (!targetOwner) {
      addExpectedOrExcluded(
        expected,
        {
          ...base,
          dedupeKey: `like_given:${targetType}:${like.target_id || '<missing_target>'}:${like.user_id}`,
          activityType: `like_given_${targetType}`,
        },
        'missing_target_owner',
      );
      return;
    }

    if (targetOwner === like.user_id) {
      addExpectedOrExcluded(
        expected,
        {
          ...base,
          dedupeKey: `like_given:${targetType}:${like.target_id}:${like.user_id}`,
          activityType: `like_given_${targetType}`,
        },
        'self_like',
      );
      return;
    }

    expected.push({
      ...base,
      dedupeKey: `like_given:${targetType}:${like.target_id}:${like.user_id}`,
      activityType: `like_given_${targetType}`,
    });

    if (isAdmin(targetOwner, appAdminUserIds)) {
      addExpectedOrExcluded(
        expected,
        {
          sourceTable: 'likes_v2',
          sourceId: like.id,
          dedupeKey: `like_received:${targetType}:${like.target_id}:from:${like.user_id}:to:${targetOwner}`,
          activityType: `like_received_${targetType}`,
          category: 'likes_received',
          basePoints: 1,
          userId: targetOwner,
          occurredAt: like.created_at,
        },
        'target_owner_admin',
      );
      return;
    }

    expected.push({
      sourceTable: 'likes_v2',
      sourceId: like.id,
      dedupeKey: `like_received:${targetType}:${like.target_id}:from:${like.user_id}:to:${targetOwner}`,
      activityType: `like_received_${targetType}`,
      category: 'likes_received',
      basePoints: 1,
      userId: targetOwner,
      occurredAt: like.created_at,
    });
  });

  return expected;
}

function buildExpectedPollVoteEvents(
  pollVotes: PollVoteRow[],
  pollPosts: PostRow[],
  appAdminUserIds: Set<string>,
): ExpectedCaptureEvent[] {
  const posts = new Map(pollPosts.map((post) => [post.id, post]));

  return pollVotes.map((vote) => {
    const post = vote.post_id ? posts.get(vote.post_id) : undefined;
    let excludedReason: string | undefined;
    if (!vote.user_id) excludedReason = 'missing_user';
    else if (isAdmin(vote.user_id, appAdminUserIds)) excludedReason = 'admin_voter';
    else if (!post?.author_id) excludedReason = 'missing_poll_post';
    else if (!post.poll_data) excludedReason = 'target_post_is_not_poll';
    else if (post.author_id === vote.user_id) excludedReason = 'own_poll_vote';

    return {
      sourceTable: 'poll_votes',
      sourceId: vote.id,
      dedupeKey: `poll_vote:${vote.post_id || '<missing_post>'}:${vote.user_id || '<missing_user>'}`,
      activityType: 'poll_vote',
      category: 'poll_vote',
      basePoints: 1,
      userId: vote.user_id || '<missing_user>',
      occurredAt: vote.created_at,
      excludedReason,
    };
  });
}

function buildExpectedRsvpEvents(
  rsvps: RsvpRow[],
  appAdminUserIds: Set<string>,
): ExpectedCaptureEvent[] {
  return rsvps.map((rsvp) => {
    const entityType = String(rsvp.entity_type || '').toLowerCase();
    let excludedReason: string | undefined;
    if (!rsvp.user_id) excludedReason = 'missing_user';
    else if (isAdmin(rsvp.user_id, appAdminUserIds)) excludedReason = 'admin_user';
    else if (rsvp.status !== 'going') excludedReason = 'rsvp_not_going';
    else if (!['match', 'event'].includes(entityType))
      excludedReason = 'unsupported_rsvp_entity_type';

    return {
      sourceTable: 'rsvps',
      sourceId: rsvp.id,
      dedupeKey: `rsvp:${entityType || '<unknown>'}:${rsvp.entity_id || '<missing_entity>'}:${rsvp.user_id || '<missing_user>'}`,
      activityType: entityType === 'match' ? 'match_rsvp' : 'event_rsvp',
      category: 'participation',
      basePoints: 2,
      userId: rsvp.user_id || '<missing_user>',
      occurredAt: rsvp.created_at,
      excludedReason,
    };
  });
}

function normalizeTeamName(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a');
}

function buildExpectedCheckinEvents(
  checkins: MatchCheckinRow[],
  fixtures: FixtureRow[],
  appAdminUserIds: Set<string>,
): ExpectedCaptureEvent[] {
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  return checkins.map((checkin) => {
    const fixture = checkin.match_id ? fixturesById.get(checkin.match_id) : undefined;
    const home = normalizeTeamName(fixture?.home_team);
    const away = normalizeTeamName(fixture?.away_team);
    const isAway =
      (away.includes('nordsjaelland') || away.includes('nordsjalland')) &&
      !(home.includes('nordsjaelland') || home.includes('nordsjalland'));
    let excludedReason: string | undefined;
    if (!checkin.user_id) excludedReason = 'missing_user';
    else if (isAdmin(checkin.user_id, appAdminUserIds)) excludedReason = 'admin_user';
    else if (!fixture || (!fixture.home_team && !fixture.away_team))
      excludedReason = 'missing_fixture';

    return {
      sourceTable: 'match_checkins',
      sourceId: checkin.id,
      dedupeKey: `match_checkin:${checkin.match_id || '<missing_match>'}:${checkin.user_id || '<missing_user>'}`,
      activityType: isAway ? 'checkin_away' : 'checkin_home',
      category: 'checkin',
      basePoints: isAway ? 18 : 10,
      userId: checkin.user_id || '<missing_user>',
      occurredAt: checkin.created_at,
      excludedReason,
    };
  });
}

function buildExpectedFanActivityRegistrationEvents(
  registrations: FanActivityRegistrationRow[],
  appAdminUserIds: Set<string>,
): ExpectedCaptureEvent[] {
  return registrations.map((registration) => {
    const status = String(registration.status || '').toLowerCase();
    let excludedReason: string | undefined;
    if (!registration.user_id) excludedReason = 'missing_user';
    else if (isAdmin(registration.user_id, appAdminUserIds)) excludedReason = 'admin_user';
    else if (!['confirmed', 'pending_verification'].includes(status)) {
      excludedReason = 'fan_activity_status_not_qualifying';
    }

    return {
      sourceTable: 'fan_activity_registrations',
      sourceId: registration.id,
      dedupeKey: `fan_activity_registration:${registration.fan_activity_id || '<missing_activity>'}:${
        registration.user_id || '<missing_user>'
      }`,
      activityType: 'fan_activity_registration',
      category: 'participation',
      basePoints: 4,
      userId: registration.user_id || '<missing_user>',
      occurredAt: registration.created_at,
      excludedReason,
    };
  });
}

function countExcluded(events: ExpectedCaptureEvent[]): Record<string, number> {
  const excluded: Record<string, number> = {};
  events.forEach((event) => {
    if (event.excludedReason) increment(excluded, event.excludedReason);
  });
  return excluded;
}

function sourceRowCount(sourceTable: SourceTable, input: ReportInput): number {
  switch (sourceTable) {
    case 'posts':
      return input.posts.length;
    case 'comments_v2':
      return input.comments.length;
    case 'likes_v2':
      return input.likes.length;
    case 'poll_votes':
      return input.pollVotes.length;
    case 'rsvps':
      return input.rsvps.length;
    case 'match_checkins':
      return input.matchCheckins.length;
    case 'fan_activity_registrations':
      return input.fanActivityRegistrations.length;
  }
}

export function buildExpectedCaptureEvents(input: ReportInput): ExpectedCaptureEvent[] {
  const appAdminUserIds = new Set(input.appAdminUserIds);
  return [
    ...buildExpectedPostEvents(input.posts, appAdminUserIds),
    ...buildExpectedCommentEvents(input.comments, appAdminUserIds),
    ...buildExpectedLikeEvents(
      input.likes,
      input.targetPosts,
      input.targetComments,
      appAdminUserIds,
    ),
    ...buildExpectedPollVoteEvents(input.pollVotes, input.pollPosts, appAdminUserIds),
    ...buildExpectedRsvpEvents(input.rsvps, appAdminUserIds),
    ...buildExpectedCheckinEvents(input.matchCheckins, input.fixtures, appAdminUserIds),
    ...buildExpectedFanActivityRegistrationEvents(input.fanActivityRegistrations, appAdminUserIds),
  ];
}

export function buildCaptureOverview(
  input: ReportInput,
  expectedEvents: ExpectedCaptureEvent[],
): CaptureSourceSummary[] {
  const periodLedgerDedupeKeys = new Set(input.ledgerEvents.map((event) => event.dedupe_key));
  const allTimeLedgerDedupeKeys = new Set(
    [...input.ledgerEvents, ...input.allTimeLedgerForExpectedKeys].map((event) => event.dedupe_key),
  );

  return SOURCE_TABLES.map((sourceTable) => {
    const expectedForSource = expectedEvents.filter((event) => event.sourceTable === sourceTable);
    const activeExpected = expectedForSource.filter((event) => !event.excludedReason);
    const foundLedgerEventsInPeriod = activeExpected.filter((event) =>
      periodLedgerDedupeKeys.has(event.dedupeKey),
    ).length;
    const alreadyDedupedOutsidePeriod = activeExpected.filter(
      (event) =>
        !periodLedgerDedupeKeys.has(event.dedupeKey) &&
        allTimeLedgerDedupeKeys.has(event.dedupeKey),
    ).length;
    const obviousMissing = activeExpected.filter(
      (event) => !allTimeLedgerDedupeKeys.has(event.dedupeKey),
    ).length;

    return {
      sourceTable,
      sourceRows: sourceRowCount(sourceTable, input),
      expectedLedgerEvents: activeExpected.length,
      foundLedgerEventsInPeriod,
      alreadyDedupedOutsidePeriod,
      obviousMissing,
      excluded: countExcluded(expectedForSource),
    };
  });
}

function buildLikeGroupKey(like: LikeRow): string {
  return `${String(like.target_type || '').toLowerCase()}:${like.target_id || '<missing_target>'}:${
    like.user_id || '<missing_user>'
  }`;
}

function buildRsvpGroupKey(rsvp: RsvpRow): string {
  return `${String(rsvp.entity_type || '').toLowerCase()}:${rsvp.entity_id || '<missing_entity>'}:${
    rsvp.user_id || '<missing_user>'
  }`;
}

function countRepeatedGroupsWithSingleLedgerEvent(
  groupKeys: string[],
  ledgerEvents: LedgerEventRow[],
  prefix: string,
): number {
  const groupCounts = new Map<string, number>();
  groupKeys.forEach((key) => groupCounts.set(key, (groupCounts.get(key) || 0) + 1));

  let repeatedWithSingleLedger = 0;
  groupCounts.forEach((count, groupKey) => {
    if (count <= 1) return;
    const ledgerCount = ledgerEvents.filter((event) =>
      event.dedupe_key.startsWith(`${prefix}:${groupKey}`),
    ).length;
    if (ledgerCount <= 1) repeatedWithSingleLedger += 1;
  });

  return repeatedWithSingleLedger;
}

export function buildDedupeOverview(input: ReportInput): DedupeOverview {
  const byDedupeKey = new Map<string, number>();
  input.ledgerEvents.forEach((event) => {
    byDedupeKey.set(event.dedupe_key, (byDedupeKey.get(event.dedupe_key) || 0) + 1);
  });

  const duplicateDedupeKeys = Array.from(byDedupeKey.entries())
    .filter(([, count]) => count > 1)
    .map(([dedupeKey, count]) => ({ dedupeKeyHash: hashValue(dedupeKey), count }));

  return {
    uniqueDedupeKeys: byDedupeKey.size,
    duplicateDedupeKeys,
    repeatedLikeGroupsWithSingleLedgerEvent: countRepeatedGroupsWithSingleLedgerEvent(
      input.likes.map(buildLikeGroupKey),
      [...input.ledgerEvents, ...input.allTimeLedgerForExpectedKeys],
      'like_given',
    ),
    repeatedRsvpGroupsWithSingleLedgerEvent: countRepeatedGroupsWithSingleLedgerEvent(
      input.rsvps.map(buildRsvpGroupKey),
      [...input.ledgerEvents, ...input.allTimeLedgerForExpectedKeys],
      'rsvp',
    ),
  };
}

export function buildDetails(
  input: ReportInput,
  expectedEvents: ExpectedCaptureEvent[],
): PseudonymizedDetail[] {
  const pseudonymize = createPseudonymizer();
  const periodLedgerDedupeKeys = new Set(input.ledgerEvents.map((event) => event.dedupe_key));
  const allTimeLedgerDedupeKeys = new Set(
    [...input.ledgerEvents, ...input.allTimeLedgerForExpectedKeys].map((event) => event.dedupe_key),
  );

  return expectedEvents.map((event) => {
    const dedupeStatus = event.excludedReason
      ? 'excluded'
      : periodLedgerDedupeKeys.has(event.dedupeKey)
        ? 'found_in_period'
        : allTimeLedgerDedupeKeys.has(event.dedupeKey)
          ? 'already_deduped_outside_period'
          : 'missing';

    return {
      user: pseudonymize(event.userId),
      sourceTable: event.sourceTable,
      sourceRef: `${event.sourceTable}#${hashValue(event.sourceId)}`,
      activityType: event.activityType,
      occurredAt: event.occurredAt,
      points: event.basePoints,
      dedupeStatus,
      reason: event.excludedReason || dedupeStatus,
    };
  });
}

export function buildReport(
  input: ReportInput,
  period: { since: string; until: string },
  checkpoints: ReportCheckpoint[] = [],
): Report {
  const expectedEvents = buildExpectedCaptureEvents(input);
  const report: Report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    period,
    readOnly: true,
    safety: {
      onlySelectQueries: true,
      noSecretsLogged: true,
      rawUserIdsInStandardOutput: false,
      liveRankingFlowsReadLedger: false,
    },
    checkpoints,
    ledgerOverview: buildLedgerOverview(input.ledgerEvents),
    captureOverview: buildCaptureOverview(input, expectedEvents),
    dedupeOverview: buildDedupeOverview(input),
    notes: [
      'Report uses SELECT-only Supabase queries.',
      'RSVP and fan-activity status toggles are only fully observable through ledger dedupe keys; current source tables may not preserve every historical status transition.',
      'weekly_ranking and weekly_top_fan are not queried by this report and do not read fan_score_events in the current repo implementation.',
    ],
  };

  if (input.includeDetails) {
    report.details = buildDetails(input, expectedEvents);
  }

  return report;
}

async function loadAllRows<T>(
  phase: string,
  checkpoints: ReportCheckpoint[],
  query: any,
): Promise<T[]> {
  const checkpoint = startCheckpoint(checkpoints, phase);
  const rows: T[] = [];
  const pageSize = 1000;
  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) {
        finishCheckpoint(checkpoint, 'failed', { reason: serializeError(error, phase).message });
        throw new LedgerReportError(phase, error);
      }
      const page = (data || []) as T[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    finishCheckpoint(checkpoint, 'ok', { rowCount: rows.length });
    return rows;
  } catch (error) {
    if (checkpoint.status !== 'failed') {
      finishCheckpoint(checkpoint, 'failed', { reason: serializeError(error, phase).message });
    }
    throw error instanceof LedgerReportError ? error : new LedgerReportError(phase, error);
  }
}

async function loadRowsByIds<T extends { id: string }>(
  phase: string,
  checkpoints: ReportCheckpoint[],
  supabase: any,
  table: string,
  select: string,
  ids: (string | null | undefined)[],
): Promise<T[]> {
  const checkpoint = startCheckpoint(checkpoints, phase);
  const uniqueIds = Array.from(
    new Set(ids.filter((value): value is string => typeof value === 'string' && value.length > 0)),
  );
  if (uniqueIds.length === 0) {
    finishCheckpoint(checkpoint, 'skipped', { rowCount: 0, reason: 'no ids to load' });
    return [];
  }

  const rows: T[] = [];
  try {
    for (let index = 0; index < uniqueIds.length; index += 100) {
      const chunk = uniqueIds.slice(index, index + 100);
      const { data, error } = await supabase.from(table).select(select).in('id', chunk);
      if (error) {
        finishCheckpoint(checkpoint, 'failed', { reason: serializeError(error, phase).message });
        throw new LedgerReportError(phase, error);
      }
      rows.push(...((data || []) as T[]));
    }
    finishCheckpoint(checkpoint, 'ok', { rowCount: rows.length });
    return rows;
  } catch (error) {
    if (checkpoint.status !== 'failed') {
      finishCheckpoint(checkpoint, 'failed', { reason: serializeError(error, phase).message });
    }
    throw error instanceof LedgerReportError ? error : new LedgerReportError(phase, error);
  }
}

async function loadLedgerEventsByDedupeKeys(
  checkpoints: ReportCheckpoint[],
  supabase: any,
  dedupeKeys: string[],
): Promise<LedgerEventRow[]> {
  const checkpoint = startCheckpoint(
    checkpoints,
    'loading all-time ledger events for expected dedupe keys',
  );
  const uniqueKeys = Array.from(new Set(dedupeKeys.filter(Boolean)));
  if (uniqueKeys.length === 0) {
    finishCheckpoint(checkpoint, 'skipped', { rowCount: 0, reason: 'no dedupe keys to load' });
    return [];
  }

  const rows: LedgerEventRow[] = [];
  const select =
    'id,user_id,activity_type,source_table,source_id,target_type,target_id,target_owner_user_id,occurred_at,cph_week_start,cph_day,base_points,category,meaningful_own_action,dedupe_key,metadata,revoked_at';
  try {
    for (let index = 0; index < uniqueKeys.length; index += 100) {
      const chunk = uniqueKeys.slice(index, index + 100);
      const { data, error } = await supabase
        .from('fan_score_events')
        .select(select)
        .in('dedupe_key', chunk)
        .is('revoked_at', null);
      if (error) {
        finishCheckpoint(checkpoint, 'failed', {
          reason: serializeError(error, checkpoint.phase).message,
        });
        throw new LedgerReportError(checkpoint.phase, error);
      }
      rows.push(...((data || []) as LedgerEventRow[]));
    }
    finishCheckpoint(checkpoint, 'ok', { rowCount: rows.length });
    return rows;
  } catch (error) {
    if (checkpoint.status !== 'failed') {
      finishCheckpoint(checkpoint, 'failed', {
        reason: serializeError(error, checkpoint.phase).message,
      });
    }
    throw error instanceof LedgerReportError
      ? error
      : new LedgerReportError(checkpoint.phase, error);
  }
}

async function loadReportInput(
  supabase: any,
  period: { since: string; until: string },
  includeDetails: boolean,
  checkpoints: ReportCheckpoint[],
): Promise<ReportInput> {
  const ledgerSelect =
    'id,user_id,activity_type,source_table,source_id,target_type,target_id,target_owner_user_id,occurred_at,cph_week_start,cph_day,base_points,category,meaningful_own_action,dedupe_key,metadata,revoked_at';

  const [
    ledgerEvents,
    posts,
    comments,
    likes,
    pollVotes,
    rsvps,
    matchCheckins,
    fanActivityRegistrations,
    appAdmins,
  ] = await Promise.all([
    loadAllRows<LedgerEventRow>(
      'loading ledger events',
      checkpoints,
      supabase
        .from('fan_score_events')
        .select(ledgerSelect)
        .gte('occurred_at', period.since)
        .lt('occurred_at', period.until)
        .is('revoked_at', null),
    ),
    loadAllRows<PostRow>(
      'loading posts',
      checkpoints,
      supabase
        .from('posts')
        .select(
          'id,author_id,created_at,post_type,actor_type,actor_id,poll_data,media_article_provenance',
        )
        .gte('created_at', period.since)
        .lt('created_at', period.until),
    ),
    loadAllRows<CommentRow>(
      'loading comments_v2',
      checkpoints,
      supabase
        .from('comments_v2')
        .select('id,author_id,target_type,target_id,created_at,parent_id')
        .gte('created_at', period.since)
        .lt('created_at', period.until),
    ),
    loadAllRows<LikeRow>(
      'loading likes_v2',
      checkpoints,
      supabase
        .from('likes_v2')
        .select('id,user_id,target_type,target_id,created_at')
        .gte('created_at', period.since)
        .lt('created_at', period.until),
    ),
    loadAllRows<PollVoteRow>(
      'loading poll_votes',
      checkpoints,
      supabase
        .from('poll_votes')
        .select('id,post_id,option_id,user_id,created_at')
        .gte('created_at', period.since)
        .lt('created_at', period.until),
    ),
    loadAllRows<RsvpRow>(
      'loading rsvps',
      checkpoints,
      supabase
        .from('rsvps')
        .select('id,entity_type,entity_id,user_id,status,created_at')
        .gte('created_at', period.since)
        .lt('created_at', period.until),
    ),
    loadAllRows<MatchCheckinRow>(
      'loading match_checkins',
      checkpoints,
      supabase
        .from('match_checkins')
        .select('id,match_id,user_id,created_at')
        .gte('created_at', period.since)
        .lt('created_at', period.until),
    ),
    loadAllRows<FanActivityRegistrationRow>(
      'loading fan_activity_registrations',
      checkpoints,
      supabase
        .from('fan_activity_registrations')
        .select('id,fan_activity_id,user_id,status,created_at')
        .gte('created_at', period.since)
        .lt('created_at', period.until),
    ),
    loadAllRows<{ user_id: string }>(
      'loading app admins',
      checkpoints,
      supabase.from('app_admins').select('user_id'),
    ),
  ]);

  const [targetPosts, targetComments, pollPosts, fixtures] = await Promise.all([
    loadRowsByIds<PostRow>(
      'loading like target posts',
      checkpoints,
      supabase,
      'posts',
      'id,author_id,created_at,post_type,actor_type,actor_id,poll_data,media_article_provenance',
      likes
        .filter((like) => String(like.target_type || '').toLowerCase() === 'post')
        .map((like) => like.target_id),
    ),
    loadRowsByIds<CommentRow>(
      'loading like target comments',
      checkpoints,
      supabase,
      'comments_v2',
      'id,author_id,target_type,target_id,created_at,parent_id',
      likes
        .filter((like) => String(like.target_type || '').toLowerCase() === 'comment')
        .map((like) => like.target_id),
    ),
    loadRowsByIds<PostRow>(
      'loading poll target posts',
      checkpoints,
      supabase,
      'posts',
      'id,author_id,created_at,post_type,actor_type,actor_id,poll_data,media_article_provenance',
      pollVotes.map((vote) => vote.post_id),
    ),
    loadRowsByIds<FixtureRow>(
      'loading check-in fixtures',
      checkpoints,
      supabase,
      'fixtures',
      'id,home_team,away_team',
      matchCheckins.map((checkin) => checkin.match_id),
    ),
  ]);

  const draftInput: ReportInput = {
    ledgerEvents,
    allTimeLedgerForExpectedKeys: [],
    posts,
    comments,
    likes,
    pollVotes,
    rsvps,
    matchCheckins,
    fanActivityRegistrations,
    targetPosts,
    targetComments,
    pollPosts,
    fixtures,
    appAdminUserIds: appAdmins.map((row) => row.user_id),
    includeDetails,
  };
  const expectedEvents = buildExpectedCaptureEvents(draftInput).filter(
    (event) => !event.excludedReason,
  );
  const allTimeLedgerForExpectedKeys = await loadLedgerEventsByDedupeKeys(
    checkpoints,
    supabase,
    expectedEvents.map((event) => event.dedupeKey),
  );

  return {
    ...draftInput,
    allTimeLedgerForExpectedKeys,
  };
}

async function main(): Promise<void> {
  loadDotEnvFile(resolve(process.cwd(), '.env'));
  loadDotEnvFile(resolve(process.cwd(), '.env.local'));
  loadDotEnvFile(resolve(process.cwd(), '.env.production'));

  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  }
  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Set it only in the current shell session before running this read-only report.',
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checkpoints: ReportCheckpoint[] = [];
  currentCheckpoints = checkpoints;
  const period = { since: options.since as string, until: options.until as string };
  const input = await loadReportInput(supabase, period, options.includeDetails, checkpoints);
  const report = buildReport(input, period, checkpoints);

  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: serializeError(error),
          checkpoints: currentCheckpoints,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
