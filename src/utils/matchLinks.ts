import { Platform } from 'react-native';

export const FCN_TICKET_URL = 'https://billet.fcn.dk';

interface MatchLinkTarget {
  home_team: string;
  lat?: number | null;
  lng?: number | null;
  venue?: string | null;
  venue_city?: string | null;
}

export function isFcnHomeMatch(fixture: Pick<MatchLinkTarget, 'home_team'>): boolean {
  return fixture.home_team.toLowerCase().includes('nordsj');
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
