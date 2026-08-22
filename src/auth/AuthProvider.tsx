import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { removeCurrentPushToken } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { clearAppIconBadge } from '../services/notificationsApi';
import { isSystemAdmin } from '../services/rbac';
import { logPerformanceTiming, performanceNow } from '../utils/performanceTiming';
import { isDemoMode } from '../config/appMode';
import { DEMO_AUTH_SESSION, DEMO_AUTH_USER } from '../demo/users';

type User = any;
type Session = any;
const AUTH_CALLBACK_URL = 'fcnfans://auth/callback';

type HandledAuthError = Error & {
  authUiHandled?: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAppAdmin: boolean;
  signInWithOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getFriendlyAuthErrorMessage(error: unknown): string {
  const rawMessage = String((error as any)?.message ?? '').trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (
    normalizedMessage.includes('email rate limit exceeded') ||
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('too many requests')
  ) {
    return 'Du har fors\u00F8gt for mange gange. Vent lidt og pr\u00F8v igen.';
  }

  if (
    normalizedMessage.includes('invalid login credentials') ||
    normalizedMessage.includes('invalid credentials') ||
    normalizedMessage.includes('invalid email or password')
  ) {
    return 'Email eller kodeord er forkert.';
  }

  if (
    normalizedMessage.includes('user already registered') ||
    normalizedMessage.includes('already registered') ||
    normalizedMessage.includes('email already')
  ) {
    return 'Der findes allerede en konto med denne email.';
  }

  return 'Noget gik galt. Pr\u00F8v igen.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(isDemoMode ? DEMO_AUTH_USER : null);
  const [session, setSession] = useState<Session | null>(isDemoMode ? DEMO_AUTH_SESSION : null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [isAppAdmin, setIsAppAdmin] = useState(false);

  // Check if user is app admin via RPC (to avoid RLS issues)
  useEffect(() => {
    if (isDemoMode) {
      setIsAppAdmin(false);
      return;
    }

    let mounted = true;

    const checkAdminStatus = async (userId: string) => {
      const adminStartedAt = performanceNow();
      try {
        // Primary path: RPC function (bypasses RLS)
        const { data: rpcIsAdmin, error } = await supabase.rpc('is_app_admin');
        if (error) {
          logger.warn(
            '[AuthProvider] RPC admin check failed, falling back to direct lookup:',
            error,
          );
        }

        // A successful false RPC result is authoritative. Only use the direct
        // lookup when the RPC itself is unavailable.
        const resolvedIsAdmin = error ? await isSystemAdmin() : !!rpcIsAdmin;

        if (mounted) {
          setIsAppAdmin(resolvedIsAdmin);
          logPerformanceTiming('Auth', 'admin-profile', adminStartedAt, {
            isAdmin: resolvedIsAdmin,
            fallbackUsed: Boolean(error),
          });
        }
      } catch (e) {
        logger.warn('[AuthProvider] Error checking admin status:', e);
        if (mounted) setIsAppAdmin(false);
        logPerformanceTiming('Auth', 'admin-profile-error', adminStartedAt);
      }
    };

    if (user?.id) {
      checkAdminStatus(user.id);
    } else {
      setIsAppAdmin(false);
    }

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (isDemoMode) {
      setSession(DEMO_AUTH_SESSION);
      setUser(DEMO_AUTH_USER);
      setLoading(false);
      return;
    }

    let mounted = true;
    const sessionStartedAt = performanceNow();

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        logPerformanceTiming('Auth', 'session', sessionStartedAt, {
          hasSession: Boolean(data.session),
        });
      } catch (e) {
        logger.warn('Error getting session', e);
        logPerformanceTiming('Auth', 'session-error', sessionStartedAt);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
      setUser(sess?.user ?? null);
    });

    return () => {
      mounted = false;
      try {
        listener.subscription.unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const signInWithOtp = async (email: string) => {
    if (isDemoMode) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      Alert.alert('Kode sendt', 'Tjek din email for login-kode.');
    } catch (e: any) {
      Alert.alert('Fejl', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (isDemoMode) return { user: DEMO_AUTH_USER, session: DEMO_AUTH_SESSION };
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    } catch (e: any) {
      const message = getFriendlyAuthErrorMessage(e);
      const handledError = new Error(message) as HandledAuthError;
      handledError.authUiHandled = true;
      Alert.alert('Fejl', message);
      throw handledError;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    if (isDemoMode) return { user: DEMO_AUTH_USER, session: DEMO_AUTH_SESSION };
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: AUTH_CALLBACK_URL,
        },
      });
      if (error) throw error;

      if (data.session) {
        await supabase.auth.signOut({ scope: 'local' } as any);
        return {
          ...data,
          session: null,
        };
      }

      return data;
    } catch (e: any) {
      const message = getFriendlyAuthErrorMessage(e);
      const handledError = new Error(message) as HandledAuthError;
      handledError.authUiHandled = true;
      Alert.alert('Fejl', message);
      throw handledError;
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (email: string, token: string) => {
    if (isDemoMode) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' } as any);
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('Fejl', e.message ?? String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const signInWithApple = async () => {
    if (isDemoMode) return;
    setLoading(true);
    try {
      const AppleAuthentication = await import('expo-apple-authentication');
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Apple Sign In er ikke tilgængelig på denne enhed');
      }

      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('Apple returnerede ikke et identity token');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;
    } catch (e: any) {
      const code = e?.code ?? e?.name;
      if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
        return;
      }
      logger.warn('[AuthProvider] Apple sign-in error:', e);
      Alert.alert('Fejl', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    if (isDemoMode) return;
    setLoading(true);
    try {
      if (user?.id) {
        await removeCurrentPushToken(user.id);
      }
      await clearAppIconBadge();
      await supabase.auth.signOut();
    } catch (e: any) {
      logger.warn('Sign out error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isAppAdmin,
        signInWithOtp,
        verifyOtp,
        signInWithApple,
        signInWithPassword,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
