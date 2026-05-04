import { Platform } from 'react-native';
import { isFcnHomeFixture, type FcnHomeFixtureTarget } from '../services/fixtures';

export const FCN_TICKET_URL = 'https://billet.fcn.dk';

interface MatchLinkTarget extends FcnHomeFixtureTarget {
  lat?: number | null;
  lng?: number | null;
  venue?: string | null;
  venue_city?: string | null;
}

export function isFcnHomeMatch(
  fixture: Pick<MatchLinkTarget, 'home_team' | 'home_team_provider_id' | 'home_team_id'>,
): boolean {
  return isFcnHomeFixture(fixture);
}

export function buildMatchMapsUrl(
  fixture: Pick<MatchLinkTarget, 'lat' | 'lng' | 'venue' | 'venue_city'>,
): string | null {
  if (fixture.lat != null && fixture.lng != null) {
    return Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${fixture.lat},${fixture.lng}&dirflg=d`
      : `https://www.google.com/maps/search/?api=1&query=${fixture.lat},${fixture.lng}`;
  }

  const venueLabel = [fixture.venue, fixture.venue_city].filter(Boolean).join(', ').trim();
  if (!venueLabel) return null;

  const encoded = encodeURIComponent(venueLabel);
  return Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${encoded}&dirflg=d`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}
