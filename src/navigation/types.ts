// Central navigation param lists used across screens
import type { Fixture } from '../services/fixtures';

export type AuthStackParamList = {
  Welcome: undefined;
  EmailOtp?: { email?: string } | undefined;
};

export type AppTabsParamList = {
  Home: undefined;
  Profile: undefined;
};

// Root stack used by screens that live outside the tab navigator (events, communities, etc.)
export type RootStackParamList = {
  // tabs container (if used)
  AppTabs?: undefined;

  // event flow
  Event: { eventId: string };
  CreateEvent: { communityId?: string | null; matchId?: string | null };

  // events module
  BusTripDetails: { busTripId: string };
  EventDetails: { eventId: string };

  // community flow
  Communities: undefined;
  CreateCommunity: undefined;
  CommunityHub: { communityId: string };

  // match details
  MatchDetails: { fixture?: Fixture; fixtureId?: string };

  // other screens
  Matchday: undefined;
  Home?: undefined;
  Profile?: undefined;
};

export default {};
