/**
 * NextMatchCard Component - Usage Examples
 *
 * Reusable Next Match widget following strict design system rules.
 * All styling uses theme tokens exclusively - no hardcoded values.
 */

import React from 'react';
import { NextMatchCard } from './NextMatchCard';

// Example 1: Upcoming Match
export function UpcomingMatchExample() {
  return (
    <NextMatchCard
      dateText="SØN 2. FEB • 14:00"
      venueText="Aalborg Portland Park"
      homeTeamName="FCN"
      awayTeamName="Brøndby"
      state="upcoming"
      kickoffLabel="Afspark om 2 dage"
      ctaLabel="Se detaljer"
      onPressCta={() => console.log('Navigate to match details')}
    />
  );
}

// Example 2: Live Match
export function LiveMatchExample() {
  return (
    <NextMatchCard
      dateText="I DAG • 19:00"
      venueText="Aalborg Portland Park"
      homeTeamName="FCN"
      awayTeamName="FC København"
      state="live"
      kickoffLabel="LIVE"
      ctaLabel="Følg kampen"
      onPressCta={() => console.log('Navigate to live match')}
    />
  );
}

// Example 3: Member Match (with badge)
export function MemberMatchExample() {
  return (
    <NextMatchCard
      dateText="LØR 8. FEB • 16:00"
      venueText="Parken"
      homeTeamName="FC København"
      awayTeamName="FCN"
      state="member"
      kickoffLabel="Udekamp"
      ctaLabel="Køb billet"
      onPressCta={() => console.log('Navigate to ticket purchase')}
    />
  );
}

// Example 4: With Team Logos (ImageSourcePropType)
export function MatchWithLogosExample() {
  return (
    <NextMatchCard
      dateText="SØN 9. FEB • 14:00"
      venueText="Aalborg Portland Park"
      homeTeamName="FCN"
      awayTeamName="AaB"
      homeLogo={require('../../assets/fcn-logo.png')} // Example path
      awayLogo={require('../../assets/aab-logo.png')} // Example path
      state="upcoming"
      kickoffLabel="Derby"
      ctaLabel="Se kampinfo"
      onPressCta={() => console.log('Navigate to match info')}
    />
  );
}

// Example 5: Minimal (no CTA, no logo)
export function MinimalMatchExample() {
  return (
    <NextMatchCard
      dateText="TOR 13. FEB • 18:00"
      venueText="MCH Arena"
      homeTeamName="FCM"
      awayTeamName="FCN"
      state="upcoming"
    />
  );
}

/**
 * Props Documentation:
 *
 * @param dateText - Match date and time (caption style)
 * @param venueText - Match venue/location (caption style)
 * @param homeTeamName - Home team name (body bold)
 * @param awayTeamName - Away team name (body bold)
 * @param homeLogo - Optional home team logo (ImageSourcePropType)
 * @param awayLogo - Optional away team logo (ImageSourcePropType)
 * @param state - Match state: 'upcoming' | 'live' | 'member'
 *   - 'upcoming': default border color
 *   - 'live': red accent border (border.active)
 *   - 'member': includes gold MEDLEM badge
 * @param kickoffLabel - Optional badge label (e.g., "Afspark om 2 dage", "LIVE")
 * @param ctaLabel - Optional CTA button text
 * @param onPressCta - Optional CTA button handler
 *
 * Styling Rules:
 * - Uses Card variant="hero"
 * - Background: theme.colors.bg.elevated
 * - Border radius: theme.radius.lg
 * - Elevation: theme.elevation.md
 * - Padding: theme.layout.cardPadding
 * - Margin: theme.layout.screenPadding
 * - Border hairline: theme.layout.borderHairline
 * - Divider: theme.colors.border.subtle
 *
 * All spacing, colors, and typography use theme tokens exclusively.
 */
