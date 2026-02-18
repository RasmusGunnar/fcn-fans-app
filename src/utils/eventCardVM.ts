// ✅ DESIGN SYSTEM GUARDRAIL: This file is a pure data mapper — no UI, no theme imports.

import type { EventSubtype } from '../components/ui/EventSubtypeBadge';
import { formatEventDate } from '../services/profileApi';
import type { FeedItem } from '../types/feed';

// ─── View-model consumed by the redesigned EventCard ────────────────────────

export interface EventCardVM {
  // Identity
  id: string;
  kind: 'match' | 'event' | 'bus_trip';

  // Visual
  heroImageUrl: string | null;
  badgeType: EventSubtype;

  // Content
  title: string;
  description: string | null;

  // Meta
  dateText: string | null;
  locationText: string | null;

  // Organizer
  organizerName: string | null;
  organizerAvatarUrl: string | null;

  // Status (accent line)
  statusLine: string | null;

  // CTA
  ctaLabel: string;

  // Feed interaction (passthrough)
  targetType: 'match' | 'event' | 'bus_trip';
}

// ─── Context the caller must supply ─────────────────────────────────────────

export interface EventCardVMContext {
  communityMap?: Record<string, string>;
  profileMap?: Record<string, { display_name: string | null; avatar_url: string | null }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a Danish date/time string.
 * Uses the existing `formatEventDate` when an ISO date is available.
 */
function safeDateText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const result = formatEventDate(iso);
  return result || null;
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

export function toEventCardVM(item: FeedItem, ctx: EventCardVMContext = {}): EventCardVM | null {
  // Defensive: item itself must have an id and a kind we handle
  if (!item || !item.id) {
    if (__DEV__) console.warn('[toEventCardVM] item missing or no id', item);
    return null;
  }

  // Defensive: item.data may be undefined at runtime despite TS types
  const d: any = (item as any).data ?? {};

  switch (item.kind) {
    // ── MATCH ────────────────────────────────────────────────────────────
    case 'match': {
      const home = d.home ?? '?';
      const away = d.away ?? '?';
      const venue = d.venue
        ? d.venueCity
          ? `${d.venue}, ${d.venueCity}`
          : d.venue
        : (d.venueCity ?? null);

      return {
        id: item.id,
        kind: 'match',
        heroImageUrl: null,
        badgeType: 'match',
        title: `${home} vs ${away}`,
        description: d.round ?? d.competition ?? null,
        dateText: safeDateText(d.kickoffAt ?? d.kickoff_at),
        locationText: venue,
        organizerName: d.competition ?? null,
        organizerAvatarUrl: null,
        statusLine: null,
        ctaLabel: 'Køb billetter',
        targetType: 'match',
      };
    }

    // ── EVENT ────────────────────────────────────────────────────────────
    case 'event': {
      const orgGroupId = d.organizerGroupId ?? d.organizer_group_id ?? null;
      const orgName = d.organizerName ?? (orgGroupId && ctx.communityMap?.[orgGroupId]) ?? null;

      return {
        id: item.id,
        kind: 'event',
        heroImageUrl: null,
        badgeType: 'event',
        title: d.title ?? 'Event',
        description: d.description ?? null,
        dateText: safeDateText(d.startAt ?? d.start_at),
        locationText: d.location ?? d.location_name ?? d.location_address ?? null,
        organizerName: orgName,
        organizerAvatarUrl: null,
        statusLine: null,
        ctaLabel: 'Tilmeld dig',
        targetType: 'event',
      };
    }

    // ── BUS TRIP ─────────────────────────────────────────────────────────
    case 'bus_trip': {
      const orgGroupId = d.organizerGroupId ?? d.organizer_group_id ?? null;
      const orgName = d.organizerName ?? (orgGroupId && ctx.communityMap?.[orgGroupId]) ?? null;

      return {
        id: item.id,
        kind: 'bus_trip',
        heroImageUrl: null,
        badgeType: 'bus_trip',
        title: d.title ?? 'Bustur',
        description: d.description ?? null,
        dateText: safeDateText(d.startAt ?? d.start_at),
        locationText: d.location ?? d.departure_place ?? null,
        organizerName: orgName,
        organizerAvatarUrl: null,
        statusLine: null,
        ctaLabel: 'Book plads',
        targetType: 'bus_trip',
      };
    }

    default:
      if (__DEV__) {
        console.warn('[toEventCardVM] unhandled item.kind:', (item as any).kind);
      }
      return null;
  }
}
