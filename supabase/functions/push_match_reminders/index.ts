// deno-lint-ignore-file no-explicit-any
import { createAdminClient, dispatchNotifications, json, requireSyncSecret } from '../_shared/push.ts';

const FCN_TEAM_PROVIDER_ID = '133890';
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const LEAD_MINUTES = 120;
const WINDOW_MINUTES = 15;

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

function readRaw(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function isFcnFixture(row: Record<string, unknown>): boolean {
  const raw = readRaw(row.raw);
  const homeId = readString(row.home_team_provider_id) ?? readString(row.home_team_id) ?? readString(raw?.idHomeTeam);
  const awayId = readString(row.away_team_provider_id) ?? readString(row.away_team_id) ?? readString(raw?.idAwayTeam);

  if (homeId === FCN_TEAM_PROVIDER_ID || awayId === FCN_TEAM_PROVIDER_ID) {
    return true;
  }

  const homeTeam = normalizeText(row.home_team);
  const awayTeam = normalizeText(row.away_team);
  return FCN_TEAM_NAME_MATCHERS.some(
    (matcher) => homeTeam.includes(matcher) || awayTeam.includes(matcher),
  );
}

function formatTimeDa(iso: string): string {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen',
  });
}

Deno.serve(async (req) => {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() + (LEAD_MINUTES - WINDOW_MINUTES) * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LEAD_MINUTES * 60 * 1000);

    const { data: fixtures, error: fixtureError } = await supabase
      .from('fixtures')
      .select('*')
      .gt('kickoff_at', windowStart.toISOString())
      .lte('kickoff_at', windowEnd.toISOString())
      .order('kickoff_at', { ascending: true });

    if (fixtureError) {
      throw fixtureError;
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('user_id, push_token')
      .order('created_at', { ascending: true });

    if (tokenError) {
      throw tokenError;
    }

    const requests =
      (fixtures ?? [])
        .filter((fixture) => isFcnFixture(fixture as Record<string, unknown>))
        .flatMap((fixture: any) =>
          (tokens ?? []).map((tokenRow: any) => ({
            userId: tokenRow.user_id as string,
            pushToken: tokenRow.push_token as string,
            notificationType: 'match_reminder',
            dedupeKey: `match_reminder:${fixture.id}:${tokenRow.push_token}`,
            title: 'Kamp i dag ⚽',
            body: `FCN spiller kl. ${formatTimeDa(String(fixture.kickoff_at))} - er du klar?`,
            data: {
              type: 'match',
              fixtureId: String(fixture.id),
              url: `fcnfans://match/${fixture.id}`,
            },
          })),
        ) ?? [];

    const result = await dispatchNotifications(supabase, requests);
    return json(200, {
      ok: true,
      fixturesMatched: (fixtures ?? []).length,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
