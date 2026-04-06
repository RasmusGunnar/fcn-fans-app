import {
  getResolvedMatchdayTiming,
  getMatchViewState,
  type MatchdayTimingState,
  type MatchViewState,
} from './matchdayState';
import {
  getMatchdayPreviewMode,
  isCheckedInPreviewActive,
  type MatchdayPreviewMode,
} from './matchdayPreview';

export type MatchParticipationChoice = 'going' | 'not_going' | null;
export type MatchdaySocialSource = 'attendance' | 'checkin';

export interface MatchdayAttendanceSnapshotInput {
  isGoing: boolean;
  countGoing: number;
  avatars: string[];
}

export interface MatchdayCheckInSnapshotInput {
  isCheckedIn: boolean;
  countCheckedIn: number;
  avatars: string[];
}

export interface MatchdayUiModelInput {
  kickoffAt: string;
  now: Date;
  attendance: MatchdayAttendanceSnapshotInput;
  checkIn: MatchdayCheckInSnapshotInput;
  participationChoice?: MatchParticipationChoice;
  previewMode?: MatchdayPreviewMode;
}

export interface MatchdayUiModel {
  previewMode: MatchdayPreviewMode;
  timing: MatchdayTimingState;
  viewState: MatchViewState;
  effectiveIsGoing: boolean;
  effectiveIsCheckedIn: boolean;
  socialSource: MatchdaySocialSource;
  socialCount: number;
  socialAvatars: string[];
  isPreMatch: boolean;
  isMatchdayAction: boolean;
  isCheckedInConfirmed: boolean;
}

export function buildMatchdayUiModel({
  kickoffAt,
  now,
  attendance,
  checkIn,
  participationChoice = null,
  previewMode = getMatchdayPreviewMode(),
}: MatchdayUiModelInput): MatchdayUiModel {
  const timing = getResolvedMatchdayTiming(kickoffAt, now, previewMode);
  const baseIsGoing = participationChoice === 'going' || attendance.isGoing;
  // `matchday` preview should only open the matchday window.
  // A real successful check-in must still be allowed to promote the UI into
  // the confirmed state on both MatchDetails and Home.
  const effectiveIsCheckedIn = isCheckedInPreviewActive(previewMode)
    ? true
    : checkIn.isCheckedIn;

  const viewState = getMatchViewState({
    isMatchday: timing.isMatchday,
    isGoing: baseIsGoing,
    isCheckedIn: effectiveIsCheckedIn,
  });

  const isCheckedInConfirmed = viewState === 'checked_in_confirmed';
  const socialSource: MatchdaySocialSource = viewState === 'pre_match' ? 'attendance' : 'checkin';

  return {
    previewMode,
    timing,
    viewState,
    effectiveIsGoing: baseIsGoing || isCheckedInConfirmed,
    effectiveIsCheckedIn,
    socialSource,
    socialCount:
      socialSource === 'attendance' ? attendance.countGoing : checkIn.countCheckedIn,
    socialAvatars: socialSource === 'attendance' ? attendance.avatars : checkIn.avatars,
    isPreMatch: viewState === 'pre_match',
    isMatchdayAction: viewState === 'matchday_action',
    isCheckedInConfirmed,
  };
}
