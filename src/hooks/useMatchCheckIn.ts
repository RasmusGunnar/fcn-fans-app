import { useAuth } from '../auth/AuthProvider';
import { useCallback, useEffect, useState } from 'react';
import {
  createMatchCheckIn,
  fetchMatchCheckInSnapshot,
  type CheckInProfile,
} from '../services/checkins';
import { getMatchdayPreviewMode } from '../utils/matchdayPreview';

export interface MatchCheckInResult {
  countCheckedIn: number;
  avatars: string[];
  profiles: CheckInProfile[];
  userIds: string[];
  isCheckedIn: boolean;
  loading: boolean;
  error: string | null;
  checkIn: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMatchCheckIn(matchId: string, kickoffAt?: string | null): MatchCheckInResult {
  const { user } = useAuth();
  const [countCheckedIn, setCountCheckedIn] = useState(0);
  const [avatars, setAvatars] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<CheckInProfile[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!matchId) {
      setCountCheckedIn(0);
      setAvatars([]);
      setProfiles([]);
      setUserIds([]);
      setIsCheckedIn(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchMatchCheckInSnapshot({
        matchId,
        currentUserId: user?.id,
      });
      setCountCheckedIn(snapshot.countCheckedIn);
      setAvatars(snapshot.avatars);
      setProfiles(snapshot.profiles);
      setUserIds(snapshot.userIds);
      setIsCheckedIn(snapshot.isCheckedIn);
    } catch (err: any) {
      setError(err?.message || 'Fejl ved check-in');
    } finally {
      setLoading(false);
    }
  }, [matchId, user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const checkIn = useCallback(async () => {
    if (!matchId) throw new Error('Manglende kamp-id');
    if (!user?.id) throw new Error('Ikke logget ind');
    if (isCheckedIn) return;

    const previewMode = getMatchdayPreviewMode();
    const isPreviewCheckIn = previewMode !== 'off';

    setLoading(true);
    setError(null);
    setIsCheckedIn(true);
    setCountCheckedIn((current) => current + 1);
    setUserIds((current) => (user.id && !current.includes(user.id) ? [user.id, ...current] : current));

    try {
      if (isPreviewCheckIn) {
        return;
      }

      await createMatchCheckIn({ matchId, userId: user.id, kickoffAt });
      await refresh();
    } catch (err: any) {
      setIsCheckedIn(false);
      setCountCheckedIn((current) => Math.max(0, current - 1));
      setError(err?.message || 'Fejl ved check-in');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isCheckedIn, kickoffAt, matchId, refresh, user?.id]);

  return {
    countCheckedIn,
    avatars,
    profiles,
    userIds,
    isCheckedIn,
    loading,
    error,
    checkIn,
    refresh,
  };
}
