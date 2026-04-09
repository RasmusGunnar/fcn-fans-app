// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  dispatchNotifications,
  fetchExistingNotificationDedupeKeys,
  fetchPushPreferencesByUserIds,
  fetchPushTokensForUsers,
  isPushPreferenceEnabled,
  json,
  requireSyncSecret,
} from '../_shared/push.ts';

const FCN_TEAM_PROVIDER_ID = '133890';
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const LEAD_MINUTES = 120;
const WINDOW_MINUTES = 15;

type MatchReminderRequest = {
  fixtureId?: string;
  targetUserIds?: string[];
  nowIso?: string;
  dryRun?: boolean;
};

type PushTokenRow = {
  user_id: string;
  push_token: string;
  platform?: string | null;
  updated_at?: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u00E6/g, 'ae')
    .replace(/\u00F8/g, 'o')
    .replace(/\u00E5/g, 'a')
    .replace(/\u00C3\u00A6/g, 'ae')
    .replace(/\u00C3\u00B8/g, 'o')
    .replace(/\u00C3\u00A5/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function readString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readRaw(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function isFcnFixture(row: Record<string, unknown>): boolean {
  const raw = readRaw(row.raw);
  const homeId =
    readString(row.home_team_provider_id) ??
    readString(row.home_team_id) ??
    readString(raw?.idHomeTeam);
  const awayId =
    readString(row.away_team_provider_id) ??
    readString(row.away_team_id) ??
    readString(raw?.idAwayTeam);

  if (homeId === FCN_TEAM_PROVIDER_ID || awayId === FCN_TEAM_PROVIDER_ID) {
    return true;
  }

  const homeTeam = normalizeText(row.home_team);
  const awayTeam = normalizeText(row.away_team);
  return FCN_TEAM_NAME_MATCHERS.some(
    (matcher) => homeTeam.includes(matcher) || awayTeam.includes(matcher),
  );
}

function hasRequiredFixtureFields(row: Record<string, unknown>): boolean {
  return Boolean(readString(row.id) && readString(row.kickoff_at));
}

function formatTimeDa(iso: string): string {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen',
  });
}

function buildOpponentLabel(row: Record<string, unknown>): string {
  const homeTeam = readString(row.home_team) ?? 'modstanderen';
  const awayTeam = readString(row.away_team) ?? 'modstanderen';
  const normalizedHome = normalizeText(homeTeam);
  const normalizedAway = normalizeText(awayTeam);
  const homeIsFcn = FCN_TEAM_NAME_MATCHERS.some((matcher) => normalizedHome.includes(matcher));
  const awayIsFcn = FCN_TEAM_NAME_MATCHERS.some((matcher) => normalizedAway.includes(matcher));

  if (homeIsFcn && !awayIsFcn) return awayTeam;
  if (awayIsFcn && !homeIsFcn) return homeTeam;
  return `${homeTeam} - ${awayTeam}`;
}

function normalizePushTokens(rows: PushTokenRow[]): PushTokenRow[] {
  return rows.flatMap((row) => {
    const userId = readString(row.user_id);
    const pushToken = readString(row.push_token);
    if (!userId || !pushToken) return [];

    return [
      {
        user_id: userId,
        push_token: pushToken,
        platform: row.platform ?? null,
        updated_at: row.updated_at ?? null,
      },
    ];
  });
}

async function fetchGoingRsvpUserIds(supabase: any, fixtureId: string) {
  const { data, error } = await supabase
    .from('rsvps')
    .select('user_id')
    .eq('entity_type', 'match')
    .eq('entity_id', fixtureId)
    .eq('status', 'going');

  if (error) throw error;

  return Array.from(
    new Set(
      ((data as { user_id?: string | null }[] | null) ?? [])
        .map((row) => readString(row.user_id))
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );
}

async function fetchCheckedInUserIds(supabase: any, fixtureId: string) {
  const { data, error } = await supabase
    .from('match_checkins')
    .select('user_id')
    .eq('match_id', fixtureId);

  if (error) throw error;

  return new Set(
    ((data as { user_id?: string | null }[] | null) ?? [])
      .map((row) => readString(row.user_id))
      .filter((userId): userId is string => Boolean(userId)),
  );
}

async function readRequestBody(req: Request): Promise<MatchReminderRequest> {
  try {
    const raw = await req.text();
    if (!raw.trim()) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as MatchReminderRequest;
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  try {
    const body = await readRequestBody(req);
    const fixtureId = readString(body.fixtureId);
    const targetUserIds = readStringArray(body.targetUserIds);
    const targetUserIdSet = new Set(targetUserIds);
    const dryRun = body.dryRun === true;
    const manualOverride =
      dryRun || Boolean(fixtureId) || targetUserIds.length > 0 || Boolean(readString(body.nowIso));

    if (manualOverride && !dryRun && targetUserIds.length === 0) {
      return json(400, {
        error:
          'Manual match reminder runs must include targetUserIds or use dryRun to avoid broad sends.',
      });
    }

    const now = readString(body.nowIso) ? new Date(String(body.nowIso)) : new Date();
    if (!isValidDate(now)) {
      return json(400, { error: 'Invalid nowIso' });
    }

    const supabase = createAdminClient();
    const windowStart = new Date(now.getTime() + (LEAD_MINUTES - WINDOW_MINUTES) * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LEAD_MINUTES * 60 * 1000);

    let fixtures: any[] = [];
    if (fixtureId) {
      const { data, error } = await supabase.from('fixtures').select('*').eq('id', fixtureId).limit(1);

      if (error) throw error;
      fixtures = Array.isArray(data) ? data : [];
    } else {
      const { data, error } = await supabase
        .from('fixtures')
        .select('*')
        .gt('kickoff_at', windowStart.toISOString())
        .lte('kickoff_at', windowEnd.toISOString())
        .order('kickoff_at', { ascending: true });

      if (error) throw error;
      fixtures = Array.isArray(data) ? data : [];
    }

    const eligibleFixtures = fixtures
      .filter((fixture) => hasRequiredFixtureFields(fixture as Record<string, unknown>))
      .filter((fixture) => isFcnFixture(fixture as Record<string, unknown>));

    const candidateRequests: {
      userId: string;
      pushToken: string;
      notificationType: string;
      dedupeKey: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
    }[] = [];
    let rsvpUsersMatched = 0;
    let recipientsTargeted = 0;
    let recipientsSkippedCheckedIn = 0;
    let recipientsSkippedMissingToken = 0;
    let recipientsSkippedPreference = 0;

    for (const fixture of eligibleFixtures) {
      const kickoffAt = readString(fixture.kickoff_at);
      const fixtureUuid = readString(fixture.id);
      if (!kickoffAt || !fixtureUuid) continue;

      const goingUserIds = await fetchGoingRsvpUserIds(supabase, fixtureUuid);
      const scopedUserIds =
        targetUserIdSet.size > 0
          ? goingUserIds.filter((userId) => targetUserIdSet.has(userId))
          : goingUserIds;

      rsvpUsersMatched += scopedUserIds.length;
      if (scopedUserIds.length === 0) continue;

      const checkedInUserIds = await fetchCheckedInUserIds(supabase, fixtureUuid);
      const notCheckedInUserIds = scopedUserIds.filter((userId) => !checkedInUserIds.has(userId));

      recipientsSkippedCheckedIn += scopedUserIds.length - notCheckedInUserIds.length;
      if (notCheckedInUserIds.length === 0) continue;

      const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, notCheckedInUserIds);
      const usersWithPreferenceEnabled = notCheckedInUserIds.filter((userId) =>
        isPushPreferenceEnabled(preferencesByUserId, userId, 'matchday_checkin'),
      );

      recipientsSkippedPreference += notCheckedInUserIds.length - usersWithPreferenceEnabled.length;
      if (usersWithPreferenceEnabled.length === 0) continue;

      const tokens = normalizePushTokens(
        (await fetchPushTokensForUsers(supabase, usersWithPreferenceEnabled)) as PushTokenRow[],
      );
      const tokenUserIds = new Set(tokens.map((tokenRow) => tokenRow.user_id));

      recipientsSkippedMissingToken += usersWithPreferenceEnabled.filter(
        (userId) => !tokenUserIds.has(userId),
      ).length;
      recipientsTargeted += tokens.length;

      const opponent = buildOpponentLabel(fixture as Record<string, unknown>);

      for (const tokenRow of tokens) {
        candidateRequests.push({
          userId: tokenRow.user_id,
          pushToken: tokenRow.push_token,
          notificationType: 'match_checkin_reminder',
          dedupeKey: buildNotificationDedupeKey(
            'match_checkin_reminder',
            fixtureUuid,
            tokenRow.user_id,
            tokenRow.push_token,
          ),
          title: 'Er du p\u00E5 stadion?',
          body: `FCN m\u00F8der ${opponent} kl. ${formatTimeDa(kickoffAt)}. Husk at tjekke ind til kampen i appen.`,
          data: {
            type: 'match',
            fixtureId: fixtureUuid,
            url: `fcnfans://match/${fixtureUuid}`,
          },
        });
      }
    }

    const existingDedupeKeys = await fetchExistingNotificationDedupeKeys(
      supabase,
      candidateRequests.map((request) => request.dedupeKey),
    );

    const requests = candidateRequests.filter(
      (request) => !existingDedupeKeys.has(request.dedupeKey),
    );

    const recipientsSkippedExistingDedupe = candidateRequests.length - requests.length;

    const summary = {
      mode: fixtureId ? 'fixture_id' : 'window',
      nowIso: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      fixturesFetched: fixtures.length,
      fixturesMatched: eligibleFixtures.length,
      rsvpUsersMatched,
      recipientsTargeted,
      recipientsSkippedCheckedIn,
      recipientsSkippedPreference,
      recipientsSkippedMissingToken,
      recipientsSkippedExistingDedupe,
      requestsPrepared: requests.length,
      dryRun,
      targetedUsers: targetUserIdSet.size,
    };

    if (dryRun) {
      console.log('[push_match_reminders] dry run', summary);
      return json(200, {
        ok: true,
        ...summary,
        sampleRequests: requests.slice(0, 3).map((request) => ({
          userId: request.userId,
          notificationType: request.notificationType,
          title: request.title,
          body: request.body,
          data: request.data,
          dedupeKey: request.dedupeKey,
        })),
      });
    }

    const result = await dispatchNotifications(supabase, requests);
    console.log('[push_match_reminders] dispatch', {
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
