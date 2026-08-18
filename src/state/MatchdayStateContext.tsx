import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import { logger } from '../lib/logger';
import {
  fetchAttendanceSnapshot,
  setAttendanceStatus,
  type RsvpStatus,
} from '../services/attendance';
import { fetchMatchCheckInSnapshot, setMatchCheckInStatus } from '../services/checkins';
import { getMatchdayPreviewMode } from '../utils/matchdayPreview';
import {
  applyCheckInSnapshot,
  applyMatchdaySnapshots,
  applyPreviewCheckIn,
  applyRsvpStatus,
  createInitialMatchdayState,
  type SharedMatchdayState,
} from './matchdayStateCore';

type MatchdayStateContextValue = {
  records: Record<string, SharedMatchdayState>;
  refresh: (matchId: string) => Promise<SharedMatchdayState>;
  setRsvp: (matchId: string, status: RsvpStatus) => Promise<void>;
  setCheckedIn: (matchId: string, checkedIn: boolean) => Promise<void>;
};

type MatchdayStateResult = SharedMatchdayState & {
  refresh: () => Promise<SharedMatchdayState>;
  setRsvpStatus: (status: RsvpStatus) => Promise<void>;
  checkIn: () => Promise<void>;
  checkOut: () => Promise<void>;
};

const MatchdayStateContext = createContext<MatchdayStateContextValue | undefined>(undefined);

function safeMatchdayMessage(action: 'load' | 'rsvp' | 'check_in' | 'check_out'): string {
  if (action === 'rsvp') return 'Kunne ikke opdatere din deltagelse. Prøv igen.';
  if (action === 'check_in') return 'Kunne ikke tjekke dig ind. Prøv igen.';
  if (action === 'check_out') return 'Kunne ikke tjekke dig ud. Prøv igen.';
  return 'Kampstatus kunne ikke hentes. Prøv igen.';
}

export function MatchdayStateProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [records, setRecords] = useState<Record<string, SharedMatchdayState>>({});
  const recordsRef = useRef(records);
  const inFlightRef = useRef(new Map<string, Promise<SharedMatchdayState>>());
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  activeUserIdRef.current = user?.id ?? null;

  const commit = useCallback(
    (matchId: string, update: (current: SharedMatchdayState) => SharedMatchdayState) => {
      const current = recordsRef.current[matchId] ?? createInitialMatchdayState(matchId);
      const next = update(current);
      recordsRef.current = { ...recordsRef.current, [matchId]: next };
      setRecords(recordsRef.current);
      return next;
    },
    [],
  );

  useEffect(() => {
    recordsRef.current = {};
    inFlightRef.current.clear();
    setRecords({});
  }, [user?.id]);

  const refresh = useCallback(
    async (matchId: string): Promise<SharedMatchdayState> => {
      if (!matchId) return createInitialMatchdayState('');
      const existing = inFlightRef.current.get(matchId);
      if (existing) return existing;

      const revisionAtStart =
        recordsRef.current[matchId]?.revision ?? createInitialMatchdayState(matchId).revision;
      const userIdAtStart = user?.id ?? null;
      commit(matchId, (current) => ({ ...current, loading: true, error: null }));
      const request = (async () => {
        try {
          const [attendance, checkIn] = await Promise.all([
            fetchAttendanceSnapshot({
              entityType: 'match',
              entityId: matchId,
              currentUserId: user?.id,
            }),
            fetchMatchCheckInSnapshot({ matchId, currentUserId: user?.id }),
          ]);
          if (activeUserIdRef.current !== userIdAtStart) {
            return recordsRef.current[matchId] ?? createInitialMatchdayState(matchId);
          }
          if ((recordsRef.current[matchId]?.revision ?? 0) !== revisionAtStart) {
            return recordsRef.current[matchId] ?? createInitialMatchdayState(matchId);
          }
          return commit(matchId, (current) => applyMatchdaySnapshots(current, attendance, checkIn));
        } catch (error) {
          if (activeUserIdRef.current !== userIdAtStart) {
            return recordsRef.current[matchId] ?? createInitialMatchdayState(matchId);
          }
          if ((recordsRef.current[matchId]?.revision ?? 0) !== revisionAtStart) {
            return recordsRef.current[matchId] ?? createInitialMatchdayState(matchId);
          }
          logger.error('[MatchdayState] refresh failed', error);
          const message = safeMatchdayMessage('load');
          commit(matchId, (current) => ({
            ...current,
            loading: false,
            loaded: true,
            error: message,
          }));
          throw new Error(message);
        } finally {
          inFlightRef.current.delete(matchId);
        }
      })();
      inFlightRef.current.set(matchId, request);
      return request;
    },
    [commit, user?.id],
  );

  const setRsvp = useCallback(
    async (matchId: string, status: RsvpStatus) => {
      if (!user?.id) throw new Error('Du skal være logget ind.');
      const requestedUserId = user.id;
      try {
        await setAttendanceStatus({
          entityType: 'match',
          entityId: matchId,
          userId: user.id,
          status,
        });
        if (activeUserIdRef.current !== requestedUserId) return;
        const pendingRefresh = inFlightRef.current.get(matchId);
        commit(matchId, (current) => applyRsvpStatus(current, status));
        const refreshAfterMutation = () => {
          void refresh(matchId).catch(() => undefined);
        };
        if (pendingRefresh) {
          void pendingRefresh.then(refreshAfterMutation, refreshAfterMutation);
        } else {
          refreshAfterMutation();
        }
      } catch (error) {
        if (activeUserIdRef.current !== requestedUserId) return;
        logger.error('[MatchdayState] RSVP mutation failed', error);
        const message = safeMatchdayMessage('rsvp');
        commit(matchId, (current) => ({ ...current, loading: false, error: message }));
        throw new Error(message);
      }
    },
    [commit, refresh, user?.id],
  );

  const setCheckedIn = useCallback(
    async (matchId: string, checkedIn: boolean) => {
      if (!user?.id) throw new Error('Du skal være logget ind.');
      const requestedUserId = user.id;
      if (getMatchdayPreviewMode() !== 'off') {
        commit(matchId, (current) => applyPreviewCheckIn(current, checkedIn));
        return;
      }

      try {
        const snapshot = await setMatchCheckInStatus({ matchId, checkedIn });
        if (activeUserIdRef.current !== requestedUserId) return;
        commit(matchId, (current) => applyCheckInSnapshot(current, snapshot));
      } catch (error) {
        if (activeUserIdRef.current !== requestedUserId) return;
        logger.error('[MatchdayState] check-in mutation failed', error);
        const message = safeMatchdayMessage(checkedIn ? 'check_in' : 'check_out');
        commit(matchId, (current) => ({ ...current, loading: false, error: message }));
        throw new Error(message);
      }
    },
    [commit, user?.id],
  );

  const value = useMemo(
    () => ({ records, refresh, setRsvp, setCheckedIn }),
    [records, refresh, setCheckedIn, setRsvp],
  );

  return <MatchdayStateContext.Provider value={value}>{children}</MatchdayStateContext.Provider>;
}

export function useMatchdayState(matchId: string): MatchdayStateResult {
  const context = useContext(MatchdayStateContext);
  if (!context) throw new Error('useMatchdayState must be used within MatchdayStateProvider');
  const { records, refresh: refreshRecord, setRsvp, setCheckedIn } = context;
  const state = records[matchId] ?? createInitialMatchdayState(matchId);
  const refresh = useCallback(() => refreshRecord(matchId), [matchId, refreshRecord]);
  const setRsvpStatus = useCallback(
    (status: RsvpStatus) => setRsvp(matchId, status),
    [matchId, setRsvp],
  );
  const checkIn = useCallback(() => setCheckedIn(matchId, true), [matchId, setCheckedIn]);
  const checkOut = useCallback(() => setCheckedIn(matchId, false), [matchId, setCheckedIn]);

  useEffect(() => {
    if (!matchId || state.loaded) return;
    void refresh().catch(() => undefined);
  }, [matchId, refresh, state.loaded]);

  return useMemo(
    () => ({
      ...state,
      refresh,
      setRsvpStatus,
      checkIn,
      checkOut,
    }),
    [checkIn, checkOut, refresh, setRsvpStatus, state],
  );
}
