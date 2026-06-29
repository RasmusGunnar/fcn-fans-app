import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildCopenhagenWeekWindow,
  calculateWeeklyShadowScore,
  copenhagenDateToUtcIso,
  getCooldownStartDate,
  getCopenhagenWeekStartDate,
  type WeeklyScoreBusTripSignalRow,
  type WeeklyScoreCheckInRow,
  type WeeklyScoreCommentRow,
  type WeeklyScoreFanActivityRegistrationRow,
  type WeeklyScoreFixtureRow,
  type WeeklyScoreLikeRow,
  type WeeklyScoreMediaArticleCandidateRow,
  type WeeklyScorePollVoteRow,
  type WeeklyScorePostRow,
  type WeeklyScoreProfileRow,
  type WeeklyScoreRsvpRow,
} from '../supabase/functions/_shared/weeklyScoreEngine.js';

type CliOptions = {
  weekStart?: string;
  weekEnd?: string;
  includeDetails: boolean;
  preset: 'single' | 'current-and-last4';
};

type ExistingWeeklyTopFanRow = {
  week_start_date: string;
  user_id: string;
  weekly_score: number;
  reason_type: string;
  is_published: boolean;
  generated_at: string;
};

type RunnerCheckpointStatus = 'started' | 'ok' | 'failed' | 'skipped';

type RunnerCheckpoint = {
  phase: string;
  status: RunnerCheckpointStatus;
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

let currentCheckpoints: RunnerCheckpoint[] = [];

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
  if (error instanceof ShadowRunnerError) {
    return error.safe;
  }

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

class ShadowRunnerError extends Error {
  readonly safe: SafeSerializedError;

  constructor(
    readonly phase: string,
    cause: unknown,
  ) {
    const safe = serializeError(cause, phase);
    super(safe.message);
    this.name = 'ShadowRunnerError';
    this.safe = safe;
  }
}

function startCheckpoint(checkpoints: RunnerCheckpoint[], phase: string): RunnerCheckpoint {
  const checkpoint: RunnerCheckpoint = {
    phase,
    status: 'started',
    startedAt: new Date().toISOString(),
  };
  checkpoints.push(checkpoint);
  return checkpoint;
}

function finishCheckpoint(
  checkpoint: RunnerCheckpoint,
  status: Exclude<RunnerCheckpointStatus, 'started'>,
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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    includeDetails: false,
    preset: 'single',
  };

  argv.forEach((arg) => {
    if (arg.startsWith('--weekStart=')) {
      options.weekStart = arg.slice('--weekStart='.length);
    } else if (arg.startsWith('--weekEnd=')) {
      options.weekEnd = arg.slice('--weekEnd='.length);
    } else if (arg === '--includeDetails' || arg === '--includeDetails=true') {
      options.includeDetails = true;
    } else if (arg === '--current-and-last4') {
      options.preset = 'current-and-last4';
    }
  });

  return options;
}

function assertDateKey(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildWeekStarts(options: CliOptions): string[] {
  if (options.preset === 'current-and-last4') {
    const currentWeekStart = getCopenhagenWeekStartDate(new Date());
    return [0, -7, -14, -21, -28].map((offset) => addDays(currentWeekStart, offset));
  }

  const weekStart = options.weekStart || getCopenhagenWeekStartDate(new Date());
  assertDateKey(weekStart, 'weekStart');
  return [weekStart];
}

function buildRequestedWindow(weekStartDate: string, weekEndDate?: string) {
  if (!weekEndDate) {
    return buildCopenhagenWeekWindow(weekStartDate);
  }

  return {
    weekStartDate,
    weekEndDate,
    weekStartUtc: copenhagenDateToUtcIso(weekStartDate),
    weekEndUtc: copenhagenDateToUtcIso(weekEndDate),
  };
}

async function loadAllRows<T>(
  phase: string,
  checkpoints: RunnerCheckpoint[],
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
        throw new ShadowRunnerError(phase, error);
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
    throw error instanceof ShadowRunnerError ? error : new ShadowRunnerError(phase, error);
  }
}

async function loadRowsByIds<T extends { id: string }>(
  phase: string,
  checkpoints: RunnerCheckpoint[],
  supabase: any,
  table: string,
  select: string,
  ids: string[],
): Promise<T[]> {
  const checkpoint = startCheckpoint(checkpoints, phase);
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
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
        throw new ShadowRunnerError(phase, error);
      }
      rows.push(...((data || []) as T[]));
    }
    finishCheckpoint(checkpoint, 'ok', { rowCount: rows.length });
    return rows;
  } catch (error) {
    if (checkpoint.status !== 'failed') {
      finishCheckpoint(checkpoint, 'failed', { reason: serializeError(error, phase).message });
    }
    throw error instanceof ShadowRunnerError ? error : new ShadowRunnerError(phase, error);
  }
}

function mergeById<T extends { id: string }>(...groups: T[][]): T[] {
  const rows = new Map<string, T>();
  groups.flat().forEach((row) => {
    if (row.id) rows.set(row.id, row);
  });
  return Array.from(rows.values());
}

function collectUserIds(input: {
  posts: WeeklyScorePostRow[];
  comments: WeeklyScoreCommentRow[];
  likes: WeeklyScoreLikeRow[];
  pollVotes: WeeklyScorePollVoteRow[];
  rsvps: WeeklyScoreRsvpRow[];
  matchCheckins: WeeklyScoreCheckInRow[];
  fanActivityRegistrations: WeeklyScoreFanActivityRegistrationRow[];
  busTripSignals: WeeklyScoreBusTripSignalRow[];
}): string[] {
  return Array.from(
    new Set(
      [
        ...input.posts.map((row) => row.author_id),
        ...input.comments.map((row) => row.author_id),
        ...input.likes.map((row) => row.user_id),
        ...input.pollVotes.map((row) => row.user_id),
        ...input.rsvps.map((row) => row.user_id),
        ...input.matchCheckins.map((row) => row.user_id),
        ...input.fanActivityRegistrations.map((row) => row.user_id),
        ...input.busTripSignals.map((row) => row.user_id),
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  );
}

async function runWeekSimulation(
  supabase: any,
  weekStartDate: string,
  includeDetails: boolean,
  checkpoints: RunnerCheckpoint[],
  weekEndDate?: string,
) {
  const week = buildRequestedWindow(weekStartDate, weekEndDate);
  const mutableRowFilter = `created_at.gte.${week.weekStartUtc},updated_at.gte.${week.weekStartUtc}`;
  const phasePrefix = `${weekStartDate}:`;

  const [
    postsInWeek,
    commentsInWeek,
    likes,
    pollVotes,
    rsvpsRaw,
    matchCheckins,
    fanActivityRegistrationsRaw,
    busTripSignalsRaw,
  ] = await Promise.all([
    loadAllRows<WeeklyScorePostRow>(
      `${phasePrefix} loading posts`,
      checkpoints,
      supabase
        .from('posts')
        .select('id, author_id, created_at, post_type, actor_type, actor_id, poll_data')
        .gte('created_at', week.weekStartUtc)
        .lt('created_at', week.weekEndUtc),
    ),
    loadAllRows<WeeklyScoreCommentRow>(
      `${phasePrefix} loading comments`,
      checkpoints,
      supabase
        .from('comments_v2')
        .select('id, author_id, target_type, target_id, created_at, parent_id')
        .gte('created_at', week.weekStartUtc)
        .lt('created_at', week.weekEndUtc),
    ),
    loadAllRows<WeeklyScoreLikeRow>(
      `${phasePrefix} loading likes`,
      checkpoints,
      supabase
        .from('likes_v2')
        .select('id, user_id, target_type, target_id, created_at')
        .gte('created_at', week.weekStartUtc)
        .lt('created_at', week.weekEndUtc)
        .in('target_type', ['post', 'comment']),
    ),
    loadAllRows<WeeklyScorePollVoteRow>(
      `${phasePrefix} loading poll votes`,
      checkpoints,
      supabase
        .from('poll_votes')
        .select('id, post_id, option_id, user_id, created_at')
        .gte('created_at', week.weekStartUtc)
        .lt('created_at', week.weekEndUtc),
    ),
    loadAllRows<WeeklyScoreRsvpRow>(
      `${phasePrefix} loading RSVPs`,
      checkpoints,
      supabase
        .from('rsvps')
        .select('id, entity_type, entity_id, user_id, status, created_at')
        .gte('created_at', week.weekStartUtc)
        .lt('created_at', week.weekEndUtc),
    ),
    loadAllRows<WeeklyScoreCheckInRow>(
      `${phasePrefix} loading check-ins`,
      checkpoints,
      supabase
        .from('match_checkins')
        .select('id, match_id, user_id, created_at')
        .gte('created_at', week.weekStartUtc)
        .lt('created_at', week.weekEndUtc),
    ),
    loadAllRows<WeeklyScoreFanActivityRegistrationRow>(
      `${phasePrefix} loading fan activity registrations`,
      checkpoints,
      supabase
        .from('fan_activity_registrations')
        .select('id, fan_activity_id, user_id, status, created_at, updated_at')
        .or(mutableRowFilter),
    ),
    loadAllRows<WeeklyScoreBusTripSignalRow>(
      `${phasePrefix} loading bus trip signals`,
      checkpoints,
      supabase
        .from('user_upcoming_items')
        .select('id, user_id, target_type, target_id, status, created_at, updated_at')
        .eq('target_type', 'bus_trip')
        .or(mutableRowFilter),
    ),
  ]);

  const rsvps = rsvpsRaw.filter(
    (row) => row.created_at >= week.weekStartUtc && row.created_at < week.weekEndUtc,
  );
  const rsvpCheckpoint = checkpoints
    .slice()
    .reverse()
    .find((checkpoint) => checkpoint.phase === `${phasePrefix} loading RSVPs`);
  if (rsvpCheckpoint && rsvpCheckpoint.status === 'ok') {
    rsvpCheckpoint.reason =
      rsvps.length > 0
        ? 'updated_at absent live; using created_at; RSVP toggle risk exists'
        : 'updated_at absent live; using created_at; no RSVP toggle risk rows in window';
  }
  const fanActivityRegistrations = fanActivityRegistrationsRaw.filter(
    (row) =>
      (row.created_at >= week.weekStartUtc && row.created_at < week.weekEndUtc) ||
      (!!row.updated_at && row.updated_at >= week.weekStartUtc && row.updated_at < week.weekEndUtc),
  );
  const busTripSignals = busTripSignalsRaw.filter(
    (row) =>
      (row.created_at >= week.weekStartUtc && row.created_at < week.weekEndUtc) ||
      (!!row.updated_at && row.updated_at >= week.weekStartUtc && row.updated_at < week.weekEndUtc),
  );

  const likedPostIds = likes
    .filter((like) => like.target_type === 'post')
    .map((like) => like.target_id);
  const likedCommentIds = likes
    .filter((like) => like.target_type === 'comment')
    .map((like) => like.target_id);
  const pollPostIds = pollVotes.map((vote) => vote.post_id);
  const [targetPosts, targetComments, fixtures] = await Promise.all([
    loadRowsByIds<WeeklyScorePostRow>(
      `${phasePrefix} loading liked/poll target posts`,
      checkpoints,
      supabase,
      'posts',
      'id, author_id, created_at, post_type, actor_type, actor_id, poll_data',
      [...likedPostIds, ...pollPostIds],
    ),
    loadRowsByIds<WeeklyScoreCommentRow>(
      `${phasePrefix} loading liked target comments`,
      checkpoints,
      supabase,
      'comments_v2',
      'id, author_id, target_type, target_id, created_at, parent_id',
      likedCommentIds,
    ),
    loadRowsByIds<WeeklyScoreFixtureRow>(
      `${phasePrefix} loading check-in fixtures`,
      checkpoints,
      supabase,
      'fixtures',
      'id, home_team, away_team',
      matchCheckins.map((checkin) => checkin.match_id),
    ),
  ]);

  const posts = mergeById(postsInWeek, targetPosts);
  const comments = mergeById(commentsInWeek, targetComments);
  const mediaArticlePostIds = posts
    .filter((post) => String(post.post_type || '').toLowerCase() === 'media_article')
    .map((post) => post.id);
  const mediaArticleCandidates =
    mediaArticlePostIds.length > 0
      ? await loadAllRows<WeeklyScoreMediaArticleCandidateRow>(
          `${phasePrefix} loading media article provenance`,
          checkpoints,
          supabase
            .from('media_article_candidates')
            .select('id, published_post_id, status, reviewed_by, source_key')
            .in('published_post_id', mediaArticlePostIds),
        )
      : [];

  const userIds = collectUserIds({
    posts,
    comments,
    likes,
    pollVotes,
    rsvps,
    matchCheckins,
    fanActivityRegistrations,
    busTripSignals,
  });
  const [profiles, appAdmins, recentWinners, existingWeeklyTopFanRows] = await Promise.all([
    userIds.length > 0
      ? loadAllRows<WeeklyScoreProfileRow>(
          `${phasePrefix} loading profiles`,
          checkpoints,
          supabase.from('profiles').select('id, display_name').in('id', userIds),
        )
      : Promise.resolve([]),
    loadAllRows<{ user_id: string }>(
      `${phasePrefix} loading admins`,
      checkpoints,
      supabase.from('app_admins').select('user_id'),
    ),
    loadAllRows<{ user_id: string }>(
      `${phasePrefix} loading recent weekly_top_fan winners`,
      checkpoints,
      supabase
        .from('weekly_top_fan')
        .select('user_id')
        .gte('week_start_date', getCooldownStartDate(weekStartDate))
        .lt('week_start_date', weekStartDate),
    ),
    loadAllRows<ExistingWeeklyTopFanRow>(
      `${phasePrefix} loading historical weekly_top_fan rows`,
      checkpoints,
      supabase
        .from('weekly_top_fan')
        .select('week_start_date, user_id, weekly_score, reason_type, is_published, generated_at')
        .eq('week_start_date', weekStartDate),
    ),
  ]);

  const shadow = calculateWeeklyShadowScore({
    ...week,
    profiles,
    appAdminUserIds: appAdmins.map((row) => row.user_id),
    recentWinnerUserIds: recentWinners.map((row) => row.user_id),
    posts,
    comments,
    likes,
    pollVotes,
    rsvps,
    matchCheckins,
    fixtures,
    fanActivityRegistrations,
    busTripSignals,
    mediaArticleCandidates,
    includeDetails,
  });

  return {
    week: shadow.week,
    shadow,
    existingComparisons: {
      weeklyRanking: {
        comparable: false,
        reason:
          'weekly_ranking is an authenticated self-only Edge Function and has no persisted all-user weekly result to read without per-user JWTs.',
      },
      weeklyTopFan: existingWeeklyTopFanRows,
    },
  };
}

async function main() {
  loadDotEnvFile(resolve(process.cwd(), '.env'));
  loadDotEnvFile(resolve(process.cwd(), '.env.local'));

  const options = parseArgs(process.argv.slice(2));
  if (options.weekEnd) {
    assertDateKey(options.weekEnd, 'weekEnd');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Shadow simulation requires service-role read access so admin/profile/candidate filters are accurate.',
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const weekStarts = buildWeekStarts(options);
  const checkpoints: RunnerCheckpoint[] = [];
  currentCheckpoints = checkpoints;
  const results = [];

  for (const weekStart of weekStarts) {
    results.push(
      await runWeekSimulation(
        supabase,
        weekStart,
        options.includeDetails,
        checkpoints,
        options.preset === 'single' ? options.weekEnd : undefined,
      ),
    );
  }

  console.log(
    JSON.stringify(
      { ok: true, generatedAt: new Date().toISOString(), checkpoints, results },
      null,
      2,
    ),
  );
}

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
