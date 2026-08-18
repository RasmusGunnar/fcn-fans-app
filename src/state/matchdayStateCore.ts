export type MatchdayRsvpStatus = 'going' | 'interested' | 'not_going' | null;

export type MatchdayProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type AttendanceSnapshotInput = {
  countGoing: number;
  avatars: string[];
  userIds: string[];
  rsvpStatus: MatchdayRsvpStatus;
};

export type MatchCheckInSnapshotInput = {
  countCheckedIn: number;
  avatars: string[];
  profiles: MatchdayProfile[];
  userIds: string[];
  isCheckedIn: boolean;
  stadiumLiveOpen: boolean;
  canCheckIn: boolean;
};

export type CurrentUserParticipationState =
  | 'checked_in'
  | 'eligible'
  | 'rsvp_going'
  | 'rsvp_not_going'
  | 'closed';

export type SharedMatchdayState = {
  matchId: string;
  rsvpStatus: MatchdayRsvpStatus;
  isCheckedIn: boolean;
  participantCount: number;
  stadiumLiveOpen: boolean;
  canCheckIn: boolean;
  currentUserParticipationState: CurrentUserParticipationState;
  attendanceCount: number;
  attendanceAvatars: string[];
  attendanceUserIds: string[];
  participantAvatars: string[];
  participantProfiles: MatchdayProfile[];
  participantUserIds: string[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  revision: number;
};

export function resolveCurrentUserParticipationState(input: {
  rsvpStatus: MatchdayRsvpStatus;
  isCheckedIn: boolean;
  stadiumLiveOpen: boolean;
}): CurrentUserParticipationState {
  if (input.isCheckedIn) return 'checked_in';
  if (input.stadiumLiveOpen) return 'eligible';
  if (input.rsvpStatus === 'going') return 'rsvp_going';
  if (input.rsvpStatus === 'not_going') return 'rsvp_not_going';
  return 'closed';
}

export function createInitialMatchdayState(matchId: string): SharedMatchdayState {
  return {
    matchId,
    rsvpStatus: null,
    isCheckedIn: false,
    participantCount: 0,
    stadiumLiveOpen: false,
    canCheckIn: false,
    currentUserParticipationState: 'closed',
    attendanceCount: 0,
    attendanceAvatars: [],
    attendanceUserIds: [],
    participantAvatars: [],
    participantProfiles: [],
    participantUserIds: [],
    loading: true,
    loaded: false,
    error: null,
    revision: 0,
  };
}

export function applyMatchdaySnapshots(
  current: SharedMatchdayState,
  attendance: AttendanceSnapshotInput,
  checkIn: MatchCheckInSnapshotInput,
): SharedMatchdayState {
  return {
    ...current,
    rsvpStatus: attendance.rsvpStatus,
    isCheckedIn: checkIn.isCheckedIn,
    participantCount: checkIn.countCheckedIn,
    stadiumLiveOpen: checkIn.stadiumLiveOpen,
    canCheckIn: checkIn.canCheckIn,
    currentUserParticipationState: resolveCurrentUserParticipationState({
      rsvpStatus: attendance.rsvpStatus,
      isCheckedIn: checkIn.isCheckedIn,
      stadiumLiveOpen: checkIn.stadiumLiveOpen,
    }),
    attendanceCount: attendance.countGoing,
    attendanceAvatars: attendance.avatars,
    attendanceUserIds: attendance.userIds,
    participantAvatars: checkIn.avatars,
    participantProfiles: checkIn.profiles,
    participantUserIds: checkIn.userIds,
    loading: false,
    loaded: true,
    error: null,
  };
}

export function applyRsvpStatus(
  current: SharedMatchdayState,
  status: MatchdayRsvpStatus,
): SharedMatchdayState {
  const wasGoing = current.rsvpStatus === 'going';
  const isGoing = status === 'going';
  const attendanceCount = Math.max(
    0,
    current.attendanceCount + (wasGoing === isGoing ? 0 : isGoing ? 1 : -1),
  );

  return {
    ...current,
    rsvpStatus: status,
    attendanceCount,
    currentUserParticipationState: resolveCurrentUserParticipationState({
      rsvpStatus: status,
      isCheckedIn: current.isCheckedIn,
      stadiumLiveOpen: current.stadiumLiveOpen,
    }),
    loading: false,
    loaded: true,
    error: null,
    revision: current.revision + 1,
  };
}

export function applyCheckInSnapshot(
  current: SharedMatchdayState,
  snapshot: MatchCheckInSnapshotInput,
): SharedMatchdayState {
  return {
    ...current,
    isCheckedIn: snapshot.isCheckedIn,
    participantCount: snapshot.countCheckedIn,
    stadiumLiveOpen: snapshot.stadiumLiveOpen,
    canCheckIn: snapshot.canCheckIn,
    currentUserParticipationState: resolveCurrentUserParticipationState({
      rsvpStatus: current.rsvpStatus,
      isCheckedIn: snapshot.isCheckedIn,
      stadiumLiveOpen: snapshot.stadiumLiveOpen,
    }),
    participantAvatars: snapshot.avatars,
    participantProfiles: snapshot.profiles,
    participantUserIds: snapshot.userIds,
    loading: false,
    loaded: true,
    error: null,
    revision: current.revision + 1,
  };
}

export function applyPreviewCheckIn(
  current: SharedMatchdayState,
  checkedIn: boolean,
): SharedMatchdayState {
  const participantCount = Math.max(
    0,
    current.participantCount + (current.isCheckedIn === checkedIn ? 0 : checkedIn ? 1 : -1),
  );
  return {
    ...current,
    isCheckedIn: checkedIn,
    participantCount,
    stadiumLiveOpen: true,
    canCheckIn: !checkedIn,
    currentUserParticipationState: checkedIn ? 'checked_in' : 'eligible',
    loading: false,
    loaded: true,
    error: null,
    revision: current.revision + 1,
  };
}
