import { Platform } from 'react-native';

export const FCN_TICKET_URL = 'https://billet.fcn.dk';
const FCN_TEAM_PROVIDER_ID = '133890';
const FCN_HOME_TEAM_MATCHERS = ['nordsjalland', 'nordsjaelland'];

interface MatchLinkTarget {
  home_team: string;
  home_team_provider_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  venue?: string | null;
  venue_city?: string | null;
}

export function isFcnHomeMatch(
  fixture: Pick<MatchLinkTarget, 'home_team' | 'home_team_provider_id'>,
): boolean {
  const homeTeamProviderId = String(fixture.home_team_provider_id ?? '').trim();
  if (homeTeamProviderId === FCN_TEAM_PROVIDER_ID) {
    return true;
  }

  const normalizedHomeTeam = fixture.home_team
    .toLowerCase()
    .trim()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return FCN_HOME_TEAM_MATCHERS.some((matcher) => normalizedHomeTeam.includes(matcher));
}

export function buildMatchMapsUrl(
  fixture: Pick<MatchLinkTarget, 'lat' | 'lng' | 'venue' | 'venue_city'>,
): string | null {
  if (fixture.lat != null && fixture.lng != null) {
    return Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${fixture.lat},${fixture.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${fixture.lat},${fixture.lng}`;
  }

  const venueLabel = [fixture.venue, fixture.venue_city].filter(Boolean).join(', ').trim();
  if (!venueLabel) return null;

  const encoded = encodeURIComponent(venueLabel);
  return Platform.OS === 'ios'
    ? `http://maps.apple.com/?q=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}
