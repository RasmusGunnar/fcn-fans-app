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

export type EventAttendeeListItemParam = {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  status: 'attendance' | 'checkin';
};

export type EventAttendeesParams =
  | {
      eventId: string;
      title?: string;
      subtitle?: string;
      entityType?: 'event';
      mode?: 'attendance' | 'checkin';
      prefilledFans?: EventAttendeeListItemParam[];
    }
  | {
      entityId: string;
      entityType: 'event' | 'match';
      title?: string;
      subtitle?: string;
      mode?: 'attendance' | 'checkin';
      prefilledFans?: EventAttendeeListItemParam[];
    };

export type EventDetailsParams = {
  eventId: string;
  fanActivityId?: string;
};

export type LibraryStackParamList = {
  LibraryMain: undefined;
  // Future: add detail screens here (e.g., SongDetails, LinkDetails, VideoDetails)
};

// Root stack used by screens that live outside the tab navigator (events, communities, etc.)
export type RootStackParamList = {
  Main: undefined;

  CreateNewEvent: undefined;
  CreateFanActivity: {
    parentType: 'match' | 'event';
    parentId: string;
    communityId?: string;
    lockCommunity?: boolean;
    fanActivityId?: string;
  };
  Create: undefined;
  MediaViewer: {
    items: ResolvedMediaItem[];
    initialIndex?: number;
    postId?: string;
  };
  Messages:
    | { screen?: 'MessagesList' }
    | { screen: 'NewMessage' }
    | { screen: 'Conversation'; params: { conversationId: string } }
    | { screen: 'GroupInfo'; params: { conversationId: string } };

  MatchDetails: { fixtureId: string; fanActivityId?: string };
  EventAttendees: EventAttendeesParams;

  // Existing routes are declared in stack navigators
};

export default {};
