import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { useAuth } from '../auth/AuthProvider';
import { fetchAttendanceSnapshot, type AttendeeProfile } from '../services/attendance';

export interface AttendanceResult {
  countGoing: number;
  avatars: string[];
  profiles: AttendeeProfile[];
  userIds: string[];
  isGoing: boolean;
  toggleGoing: () => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useAttendance({ entityType, entityId }: { entityType: 'event' | 'match'; entityId: string }): AttendanceResult {
  const { user } = useAuth();
  const [countGoing, setCountGoing] = useState(0);
  const [avatars, setAvatars] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<AttendeeProfile[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [isGoing, setIsGoing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async () => {
    if (!entityId) {
      setCountGoing(0);
      setAvatars([]);
      setProfiles([]);
      setUserIds([]);
      setIsGoing(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchAttendanceSnapshot({
        entityType,
        entityId,
        currentUserId: user?.id,
      });
      setCountGoing(snapshot.countGoing);
      setAvatars(snapshot.avatars);
      setProfiles(snapshot.profiles);
      setUserIds(snapshot.userIds);
      setIsGoing(snapshot.isGoing);
    } catch (err: any) {
      setError(err.message || 'Fejl ved attendance');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, user?.id]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const toggleGoing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!entityId) throw new Error('Ingen attendance reference');
      if (!user?.id) throw new Error('Ikke logget ind');
      const userId = user.id;
      const nextIsGoing = !isGoing;

      setIsGoing(nextIsGoing);
      setCountGoing((current) => Math.max(0, current + (nextIsGoing ? 1 : -1)));

      logger.log('[Attendance] toggle start', { entityId, entityType, userId, isGoing });
      if (isGoing) {
        // Delete RSVP
        const { data: deleteData, error: delError } = await supabase
          .from('rsvps')
          .delete()
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .eq('user_id', userId);
        logger.log('[Attendance] delete result', { data: deleteData, error: delError });
        if (delError) throw delError;
      } else {
        // Upsert RSVP
        const payload = [
          {
            entity_type: entityType,
            entity_id: entityId,
            user_id: userId,
            status: 'going',
          },
        ];
        logger.log('[Attendance] insert payload', payload);
        const { data: upsertData, error: upsertError } = await supabase
          .from('rsvps')
          .upsert(payload, { onConflict: 'entity_type,entity_id,user_id' });
        logger.log('[Attendance] insert result', { data: upsertData, error: upsertError });
        if (upsertError) throw upsertError;
      }
      await fetchAttendance();
    } catch (err: any) {
      setIsGoing(isGoing);
      setCountGoing(countGoing);
      setError(err.message || 'Fejl ved toggle');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, user?.id, isGoing, countGoing, fetchAttendance]);

  return {
    countGoing,
    avatars,
    profiles,
    userIds,
    isGoing,
    toggleGoing,
    refresh: fetchAttendance,
    loading,
    error,
  };
}
