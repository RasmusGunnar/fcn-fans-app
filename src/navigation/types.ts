import type { ResolvedMediaItem } from '../utils/media';

// Central navigation param lists used across screens

export type AuthStackParamList = {
  Welcome: undefined;
  Login: { mode?: 'login' | 'signup' } | undefined;
  EmailOtp?: { email?: string } | undefined;
};

export type AppTabsParamList = {
  Home: undefined;
  Communities: undefined;
  Events: undefined;
  Songs: undefined;
  Profile: undefined;
};

export type EventAttendeesParams =
  | { eventId: string; title?: string; entityType?: 'event'; mode?: 'attendance' | 'checkin' }
  | {
      entityId: string;
      entityType: 'event' | 'match';
      title?: string;
      mode?: 'attendance' | 'checkin';
    };

export type LibraryStackParamList = {
  LibraryMain: undefined;
  // Future: add detail screens here (e.g., SongDetails, LinkDetails, VideoDetails)
};

// Root stack used by screens that live outside the tab navigator (events, communities, etc.)
export type RootStackParamList = {
  Main: undefined;

  CreateNewEvent: undefined;
  Create: undefined;
  MediaViewer: {
    items: ResolvedMediaItem[];
    initialIndex?: number;
    postId?: string;
  };

  MatchDetails: { fixtureId: string };
  EventAttendees: EventAttendeesParams;

  // Existing routes are declared in stack navigators
};

export default {};
