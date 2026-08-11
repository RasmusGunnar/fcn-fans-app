import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import {
  addIncomingNativeShareListener,
  consumePendingNativeShare,
  getPendingNativeShare,
} from '../lib/incomingShareNative';
import { logger } from '../lib/logger';
import type { IncomingExternalShare, PersistedIncomingShare } from '../types/externalShare';
import {
  canPresentIncomingShare,
  mergeIncomingShare,
  parseNativeIncomingShareJson,
  parsePersistedIncomingShare,
} from '../utils/incomingShare';

const STORAGE_KEY = '@fcn-fans/pending-external-share-v1';

type IncomingShareContextValue = {
  pendingShare: IncomingExternalShare | null;
  loading: boolean;
  discardPendingShare: () => Promise<void>;
  takePendingShare: () => Promise<IncomingExternalShare | null>;
  refreshPendingShare: () => Promise<void>;
};

const IncomingShareContext = createContext<IncomingShareContextValue | undefined>(undefined);

export function IncomingShareProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [record, setRecord] = useState<PersistedIncomingShare | null>(null);
  const [loading, setLoading] = useState(true);
  const recordRef = useRef<PersistedIncomingShare | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  recordRef.current = record;
  activeUserIdRef.current = user?.id ?? null;

  const persistRecord = useCallback(async (next: PersistedIncomingShare | null) => {
    recordRef.current = next;
    setRecord(next);
    if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const ingestNativePayload = useCallback(
    async (payloadJson: string) => {
      const incoming = parseNativeIncomingShareJson(payloadJson);
      let nativeId: string | null = null;
      try {
        const untrusted = JSON.parse(payloadJson) as { id?: unknown };
        nativeId = typeof untrusted.id === 'string' ? untrusted.id : null;
      } catch {
        nativeId = null;
      }

      if (!incoming) {
        if (nativeId) await consumePendingNativeShare(nativeId).catch(() => undefined);
        return;
      }

      const next = mergeIncomingShare(recordRef.current, incoming, activeUserIdRef.current);
      await persistRecord(next);
      if (nativeId) await consumePendingNativeShare(nativeId).catch(() => undefined);
    },
    [persistRecord],
  );

  const refreshPendingShare = useCallback(async () => {
    const payload = await getPendingNativeShare().catch((error) => {
      logger.warn('[IncomingShare] Native payload read failed', error);
      return null;
    });
    if (payload) await ingestNativePayload(payload);
  }, [ingestNativePayload]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    void (async () => {
      const stored = parsePersistedIncomingShare(await AsyncStorage.getItem(STORAGE_KEY));
      if (!active) return;
      if (stored && canPresentIncomingShare(stored, user?.id)) {
        recordRef.current = stored;
        setRecord(stored);
      } else if (stored) {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
      await refreshPendingShare();
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [authLoading, refreshPendingShare, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    const subscription = addIncomingNativeShareListener((payload) => {
      void ingestNativePayload(payload);
    });
    return () => subscription?.remove();
  }, [authLoading, ingestNativePayload]);

  useEffect(() => {
    let state: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const becameActive = nextState === 'active' && state !== 'active';
      state = nextState;
      if (becameActive && !authLoading) void refreshPendingShare();
    });
    return () => subscription.remove();
  }, [authLoading, refreshPendingShare]);

  useEffect(() => {
    const current = recordRef.current;
    if (!authLoading && current && !canPresentIncomingShare(current, user?.id)) {
      void persistRecord(null);
    }
  }, [authLoading, persistRecord, user?.id]);

  const discardPendingShare = useCallback(async () => persistRecord(null), [persistRecord]);

  const takePendingShare = useCallback(async () => {
    const current = recordRef.current;
    if (!current || !canPresentIncomingShare(current, activeUserIdRef.current)) return null;
    await persistRecord(null);
    return current.share;
  }, [persistRecord]);

  const pendingShare = record && canPresentIncomingShare(record, user?.id) ? record.share : null;
  const value = useMemo<IncomingShareContextValue>(
    () => ({ pendingShare, loading, discardPendingShare, takePendingShare, refreshPendingShare }),
    [discardPendingShare, loading, pendingShare, refreshPendingShare, takePendingShare],
  );

  return <IncomingShareContext.Provider value={value}>{children}</IncomingShareContext.Provider>;
}

export function useIncomingShare() {
  const context = useContext(IncomingShareContext);
  if (!context) throw new Error('useIncomingShare must be used within IncomingShareProvider');
  return context;
}
