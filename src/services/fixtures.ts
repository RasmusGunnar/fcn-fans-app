import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { fixEncoding } from '../utils/fixEncoding';

export interface Fixture {
  id: string;
  provider: string;
  provider_fixture_id: string;
  kickoff_at: string;
  end_time?: string | null;
  competition: string | null;
  round: string | null;
  venue: string | null;
  venue_city: string | null;
  home_team: string;
  away_team: string;
  home_logo_url: string | null;
  away_logo_url: string | null;
  created_at: string;
  updated_at: string;
  home_team_provider_id?: string | null;
  away_team_provider_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_name?: string | null;
  geocoded_at?: string | null;
  raw?: Record<string, unknown> | null;
}

const FCN_FIXTURES_VIEW = 'v_fcn_fixtures';
const FCN_TEAM_FILTER = '%nordsjælland%';
const FCN_TEAM_PROVIDER_ID = '133890';
const NEXT_FIXTURE_LOOKAHEAD_LIMIT = 50;
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const PRIMARY_FIXTURE_LOOKBACK_HOURS = 12;
const DEFAULT_FIXTURE_DURATION_HOURS = 2;
const FIXTURE_END_GRACE_HOURS = 1;
const MS_PER_HOUR = 1000 * 60 * 60;

type FixtureRow = Record<string, unknown>;

function shouldFallbackView(error: any): boolean {
  const message = String(error?.message ?? '');
  return (
    error?.code === '42P01' || message.includes('does not exist') || message.includes('relation')
  );
}

function applyFcnFilter(query: any) {
  return query.or(`home_team.ilike.${FCN_TEAM_FILTER},away_team.ilike.${FCN_TEAM_FILTER}`);
}

function normalizeText(value: unknown): string {
  return (fixEncoding(String(value ?? '')) ?? '')
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = (fixEncoding(value) ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRawFixture(raw: unknown): FixtureRow | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as FixtureRow;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as FixtureRow)
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function toKickoffTimestamp(kickoffAt: string | null | undefined): number {
  if (!kickoffAt) return 0;
  const timestamp = new Date(kickoffAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toValidDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * MS_PER_HOUR);
}

function compareFixturesByKickoffAsc(a: Fixture, b: Fixture): number {
  const kickoffDiff = toKickoffTimestamp(a.kickoff_at) - toKickoffTimestamp(b.kickoff_at);
  if (kickoffDiff !== 0) return kickoffDiff;
  return a.id.localeCompare(b.id);
}

function isFixtureDataComplete(fixture: Fixture): boolean {
  return Boolean(
    fixture.id &&
      fixture.home_team &&
      fixture.away_team &&
      fixture.kickoff_at &&
      toKickoffTimestamp(fixture.kickoff_at) > 0,
  );
}

function fixtureIncludesFcn(fixture: Fixture): boolean {
  const homeTeamId = readString(fixture.home_team_provider_id ?? fixture.home_team_id);
  const awayTeamId = readString(fixture.away_team_provider_id ?? fixture.away_team_id);

  if (homeTeamId === FCN_TEAM_PROVIDER_ID || awayTeamId === FCN_TEAM_PROVIDER_ID) {
    return true;
  }

  const homeName = normalizeText(fixture.home_team);
  const awayName = normalizeText(fixture.away_team);

  return FCN_TEAM_NAME_MATCHERS.some(
    (matcher) => homeName.includes(matcher) || awayName.includes(matcher),
  );
}

export type FcnHomeFixtureTarget = Pick<
  Fixture,
  'home_team' | 'home_team_provider_id' | 'home_team_id'
>;

export function isFcnHomeFixture(fixture: FcnHomeFixtureTarget): boolean {
  const homeTeamId = readString(fixture.home_team_provider_id ?? fixture.home_team_id);
  if (homeTeamId === FCN_TEAM_PROVIDER_ID) {
    return true;
  }

  const homeName = normalizeText(fixture.home_team);
  return FCN_TEAM_NAME_MATCHERS.some((matcher) => homeName.includes(matcher));
}

export function getFixtureEffectiveEndTime(
  fixture: Pick<Fixture, 'kickoff_at' | 'end_time'>,
): Date | null {
  const kickoff = toValidDate(fixture.kickoff_at);
  if (!kickoff) return null;

  const explicitEnd = toValidDate(fixture.end_time ?? null);
  if (explicitEnd && explicitEnd.getTime() >= kickoff.getTime()) {
    return explicitEnd;
  }

  return addHours(kickoff, DEFAULT_FIXTURE_DURATION_HOURS);
}

export function isFixtureActive(
  fixture: Pick<Fixture, 'kickoff_at' | 'end_time'>,
  now: Date = new Date(),
): boolean {
  const kickoff = toValidDate(fixture.kickoff_at);
  const effectiveEnd = getFixtureEffectiveEndTime(fixture);
  if (!kickoff || !effectiveEnd) return false;

  const graceEnd = addHours(effectiveEnd, FIXTURE_END_GRACE_HOURS);
  const nowTimestamp = now.getTime();
  return nowTimestamp >= kickoff.getTime() && nowTimestamp <= graceEnd.getTime();
}

function normalizeFixture(row: FixtureRow): Fixture | null {
  const raw = readRawFixture(row.raw);
  const kickoffAt = readString(row.kickoff_at);
  const homeTeam = readString(row.home_team);
  const awayTeam = readString(row.away_team);
  const id = readString(row.id);

  if (!id || !kickoffAt || !homeTeam || !awayTeam) {
    return null;
  }

  return {
    id,
    provider: readString(row.provider) ?? 'unknown',
    provider_fixture_id:
      readString(row.provider_fixture_id) ?? readString(row.external_id) ?? id,
    kickoff_at: kickoffAt,
    end_time: readString(row.end_time) ?? readString(raw?.end_time) ?? readString(raw?.endTime),
    competition: readString(row.competition),
    round: readString(row.round),
    venue: readString(row.venue) ?? readString(row.venue_name),
    venue_city: readString(row.venue_city) ?? readString(row.city),
    home_team: homeTeam,
    away_team: awayTeam,
    home_logo_url: readString(row.home_logo_url),
    away_logo_url: readString(row.away_logo_url),
    created_at: readString(row.created_at) ?? kickoffAt,
    updated_at: readString(row.updated_at) ?? readString(row.created_at) ?? kickoffAt,
    home_team_provider_id: readString(row.home_team_provider_id) ?? readString(raw?.idHomeTeam),
    away_team_provider_id: readString(row.away_team_provider_id) ?? readString(raw?.idAwayTeam),
    home_team_id: readString(row.home_team_id) ?? readString(raw?.home_team_id),
    away_team_id: readString(row.away_team_id) ?? readString(raw?.away_team_id),
    lat: readNumber(row.lat),
    lng: readNumber(row.lng),
    place_name: readString(row.place_name),
    geocoded_at: readString(row.geocoded_at),
    raw,
  };
}

function normalizeUpcomingFixtures(rows: unknown[] | null | undefined): Fixture[] {
  const deduped = new Map<string, Fixture>();

  (rows ?? [])
    .map((row) => normalizeFixture((row ?? {}) as FixtureRow))
    .filter((fixture): fixture is Fixture => Boolean(fixture))
    .filter(isFixtureDataComplete)
    .filter(fixtureIncludesFcn)
    .sort(compareFixturesByKickoffAsc)
    .forEach((fixture) => {
      if (!deduped.has(fixture.id)) {
        deduped.set(fixture.id, fixture);
      }
    });

  return Array.from(deduped.values());
}

async function fetchRelevantFixturesFromTable(table: string, limit: number): Promise<Fixture[]> {
  const cutoffIso = new Date(
    Date.now() - PRIMARY_FIXTURE_LOOKBACK_HOURS * MS_PER_HOUR,
  ).toISOString();
  let query = supabase.from(table).select('*');

  if (table === 'fixtures') {
    query = applyFcnFilter(query);
  }

  const { data, error } = await query
    .gte('kickoff_at', cutoffIso)
    .order('kickoff_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return normalizeUpcomingFixtures(data);
}

async function fetchUpcomingFixturesFromTable(table: string, limit: number): Promise<Fixture[]> {
  const nowIso = new Date().toISOString();
  let query = supabase.from(table).select('*');

  if (table === 'fixtures') {
    query = applyFcnFilter(query);
  }

  const { data, error } = await query
    .gt('kickoff_at', nowIso)
    .order('kickoff_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return normalizeUpcomingFixtures(data);
}

async function fetchBestUpcomingFixtures(limit: number): Promise<Fixture[]> {
  try {
    const viewFixtures = await fetchUpcomingFixturesFromTable(FCN_FIXTURES_VIEW, limit);
    if (viewFixtures.length > 0) {
      return viewFixtures;
    }
  } catch (error) {
    if (!shouldFallbackView(error)) {
      logger.warn('[fixtures] View query failed, trying fixtures fallback:', error);
    }
  }

  try {
    return await fetchUpcomingFixturesFromTable('fixtures', limit);
  } catch (error) {
    logger.error('[fixtures] Error fetching upcoming fixtures (fallback):', error);
    return [];
  }
}

async function fetchBestRelevantFixtures(limit: number): Promise<Fixture[]> {
  try {
    const viewFixtures = await fetchRelevantFixturesFromTable(FCN_FIXTURES_VIEW, limit);
    if (viewFixtures.length > 0) {
      return viewFixtures;
    }
  } catch (error) {
    if (!shouldFallbackView(error)) {
      logger.warn('[fixtures] Relevant view query failed, trying fixtures fallback:', error);
    }
  }

  try {
    return await fetchRelevantFixturesFromTable('fixtures', limit);
  } catch (error) {
    logger.error('[fixtures] Error fetching primary fixture candidates (fallback):', error);
    return [];
  }
}

function selectNextFixture(fixtures: Fixture[], now = new Date()): Fixture | null {
  const nowTimestamp = now.getTime();
  const upcomingFixtures = fixtures
    .filter((fixture) => toKickoffTimestamp(fixture.kickoff_at) > nowTimestamp)
    .sort(compareFixturesByKickoffAsc);

  if (upcomingFixtures.length === 0) {
    return null;
  }

  const nextHomeFixture = upcomingFixtures.find(isFcnHomeFixture);
  return nextHomeFixture ?? upcomingFixtures[0] ?? null;
}

function compareActiveFixtures(a: Fixture, b: Fixture, now: Date): number {
  const homeDiff = Number(isFcnHomeFixture(b)) - Number(isFcnHomeFixture(a));
  if (homeDiff !== 0) return homeDiff;

  const distanceA = Math.abs(now.getTime() - toKickoffTimestamp(a.kickoff_at));
  const distanceB = Math.abs(now.getTime() - toKickoffTimestamp(b.kickoff_at));
  if (distanceA !== distanceB) return distanceA - distanceB;

  return toKickoffTimestamp(b.kickoff_at) - toKickoffTimestamp(a.kickoff_at);
}

export function selectPrimaryFixture(fixtures: Fixture[], now = new Date()): Fixture | null {
  const nowTimestamp = now.getTime();
  const candidates = [...fixtures]
    .filter(isFixtureDataComplete)
    .filter(fixtureIncludesFcn)
    .sort(compareFixturesByKickoffAsc);

  const activeFixtures = candidates.filter((fixture) => isFixtureActive(fixture, now));
  if (activeFixtures.length > 0) {
    return [...activeFixtures].sort((a, b) => compareActiveFixtures(a, b, now))[0] ?? null;
  }

  const upcomingFixtures = candidates.filter(
    (fixture) => toKickoffTimestamp(fixture.kickoff_at) > nowTimestamp,
  );
  if (upcomingFixtures.length === 0) {
    return null;
  }

  const nextHomeFixture = upcomingFixtures.find(isFcnHomeFixture);
  return nextHomeFixture ?? upcomingFixtures[0] ?? null;
}

export async function fetchUpcomingFcntFixtures(limit = 30): Promise<Fixture[]> {
  try {
    return await fetchBestUpcomingFixtures(limit);
  } catch (err) {
    logger.error('[fixtures] Unexpected error fetching FCN upcoming fixtures:', err);
    return [];
  }
}

export async function fetchUpcomingFixtures(limitCount = 50): Promise<Fixture[]> {
  try {
    return await fetchBestUpcomingFixtures(limitCount);
  } catch (err) {
    logger.error('[fixtures] Unexpected error:', err);
    return [];
  }
}

export async function fetchPrimaryFixture(): Promise<Fixture | null> {
  try {
    const fixtures = await fetchBestRelevantFixtures(NEXT_FIXTURE_LOOKAHEAD_LIMIT);
    return selectPrimaryFixture(fixtures);
  } catch (err) {
    logger.error('[fixtures] Unexpected error fetching primary fixture:', err);
    return null;
  }
}

export async function fetchNextFixture(): Promise<Fixture | null> {
  try {
    const fixtures = await fetchBestUpcomingFixtures(NEXT_FIXTURE_LOOKAHEAD_LIMIT);
    return selectNextFixture(fixtures);
  } catch (err) {
    logger.error('[fixtures] Unexpected error:', err);
    return null;
  }
}

export function formatDateDa(isoString: string): string {
  try {
    const date = new Date(isoString);
    const weekday = date.toLocaleDateString('da-DK', { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString('da-DK', { month: 'long' });
    const year = date.getFullYear();
    const time = date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    return `${weekdayCapitalized} ${day}. ${month} ${year}, kl. ${time}`;
  } catch (err) {
    logger.error('[fixtures] Error formatting date:', err);
    return isoString;
  }
}

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function formatShortDateDa(isoString: string): string {
  try {
    const date = new Date(isoString);
    const day = date.getDate();
    const month = date.toLocaleDateString('da-DK', { month: 'long' });
    const year = date.getFullYear();

    return `${day}. ${month} ${year}`;
  } catch {
    return isoString;
  }
}
