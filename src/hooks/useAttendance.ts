import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';
import { useAuth } from '../auth/AuthProvider';

export interface AttendanceResult {
  countGoing: number;
  avatars: string[];
  isGoing: boolean;
  toggleGoing: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useAttendance({ entityType, entityId }: { entityType: 'event' | 'match'; entityId: string }): AttendanceResult {
  const { user } = useAuth();
  const [countGoing, setCountGoing] = useState(0);
  const [avatars, setAvatars] = useState<string[]>([]);
  const [isGoing, setIsGoing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Count
      const { data: countData, error: countError } = await supabase
        .from('rsvps')
        .select('id', { count: 'exact' })
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('status', 'going');
      if (countError) throw countError;
      setCountGoing(countData?.length || 0);

      // Avatars
      const { data: avatarData, error: avatarError } = await supabase
        .from('rsvps')
        .select('user_id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('status', 'going')
        .order('created_at', { ascending: false })
        .limit(5);
      if (avatarError) throw avatarError;
      const userIds = avatarData?.map((r: any) => r.user_id) || [];
      let avatarUrls: string[] = [];
      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', userIds);
        if (profileError) throw profileError;
          avatarUrls = profiles.map((p: any) => resolveAvatarUrl(p.avatar_url)).filter((url): url is string => !!url);
      }
      setAvatars(avatarUrls);

      // IsGoing
      let going = false;
      if (user?.id) {
        const { data: myRsvp, error: myRsvpError } = await supabase
          .from('rsvps')
          .select('id')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .eq('user_id', user.id)
          .eq('status', 'going')
          .single();
        if (myRsvpError && myRsvpError.code !== 'PGRST116') throw myRsvpError;
        going = !!myRsvp;
      }
      setIsGoing(going);
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
    try {
      if (!user?.id) throw new Error('Ikke logget ind');
      if (isGoing) {
        // Delete RSVP
        const { error: delError } = await supabase
          .from('rsvps')
          .delete()
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .eq('user_id', user.id);
        if (delError) throw delError;
      } else {
        // Upsert RSVP
        const { error: upsertError } = await supabase
          .from('rsvps')
          .upsert([
            {
              entity_type: entityType,
              entity_id: entityId,
              user_id: user.id,
              status: 'going',
            }
          ], { onConflict: 'entity_type,entity_id,user_id' });
        if (upsertError) throw upsertError;
      }
      await fetchAttendance();
    } catch (err: any) {
      setError(err.message || 'Fejl ved toggle');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, user?.id, isGoing, fetchAttendance]);

  return {
    countGoing,
    avatars,
    isGoing,
    toggleGoing,
    loading,
    error,
  };
}
