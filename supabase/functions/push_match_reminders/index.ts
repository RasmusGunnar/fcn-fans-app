// deno-lint-ignore-file no-explicit-any
import {
  createAdminClient,
  dispatchNotifications,
  fetchAllPushTokens,
  fetchPushTokensForUsers,
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

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
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
      const { data, error } = await supabase
        .from('fixtures')
        .select('*')
        .eq('id', fixtureId)
        .limit(1);

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

    const tokens =
      targetUserIds.length > 0
        ? await fetchPushTokensForUsers(supabase, targetUserIds)
        : await fetchAllPushTokens(supabase);

    const requests = eligibleFixtures.flatMap((fixture: any) => {
      const kickoffAt = readString(fixture.kickoff_at);
      const fixtureUuid = readString(fixture.id);
      if (!kickoffAt || !fixtureUuid) return [];

      const opponent = buildOpponentLabel(fixture as Record<string, unknown>);
      return tokens.map((tokenRow: any) => ({
        userId: tokenRow.user_id as string,
        pushToken: tokenRow.push_token as string,
        notificationType: 'match_reminder',
        dedupeKey: `match_reminder:${fixtureUuid}:${tokenRow.push_token}`,
        title: 'Kamp i dag',
        body: `FCN møder ${opponent} kl. ${formatTimeDa(kickoffAt)}.`,
        data: {
          type: 'match',
          fixtureId: fixtureUuid,
          url: `fcnfans://match/${fixtureUuid}`,
        },
      }));
    });

    const summary = {
      mode: fixtureId ? 'fixture_id' : 'window',
      nowIso: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      fixturesFetched: fixtures.length,
      fixturesMatched: eligibleFixtures.length,
      tokensTargeted: tokens.length,
      requestsPrepared: requests.length,
      dryRun,
      targetedUsers: targetUserIds.length,
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
