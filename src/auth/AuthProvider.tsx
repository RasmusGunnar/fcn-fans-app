import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { removeCurrentPushToken } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { isSystemAdmin } from '../services/rbac';

type User = any;
type Session = any;
const FACEBOOK_REDIRECT_URL = 'fcnfans://auth/callback';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAppAdmin: boolean;
  signInWithOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function extractAuthCallbackParams(url: string): URLSearchParams {
  const parsedUrl = new URL(url);
  const params = new URLSearchParams(parsedUrl.search);
  const hash = parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash;

  if (!hash) {
    return params;
  }

  const hashParams = new URLSearchParams(hash);
  hashParams.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });

  return params;
}

async function completeOAuthSessionFromUrl(url: string) {
  const params = extractAuthCallbackParams(url);
  const errorMessage = params.get('error_description') ?? params.get('error');

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) throw error;
    return;
  }

  const authCode = params.get('code');
  if (authCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (error) throw error;
    return;
  }

  throw new Error('Kunne ikke gennemfoere Facebook login.');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAppAdmin, setIsAppAdmin] = useState(false);

  // Check if user is app admin via RPC (to avoid RLS issues)
  useEffect(() => {
    let mounted = true;

    const checkAdminStatus = async (userId: string) => {
      try {
        // Primary path: RPC function (bypasses RLS)
        const { data: rpcIsAdmin, error } = await supabase.rpc('is_app_admin');
        if (error) {
          logger.warn(
            '[AuthProvider] RPC admin check failed, falling back to direct lookup:',
            error,
          );
        }

        let resolvedIsAdmin = !error && !!rpcIsAdmin;

        // Fallback: direct self-row lookup in app_admins via existing RLS policy.
        // This keeps the underlying source of truth the same while avoiding silent false negatives.
        if (!resolvedIsAdmin) {
          const directIsAdmin = await isSystemAdmin();
          if (directIsAdmin && !rpcIsAdmin) {
            logger.warn(
              '[AuthProvider] Admin fallback activated: RPC returned false but app_admins lookup returned true',
              {
                userId,
              },
            );
          }
          resolvedIsAdmin = directIsAdmin;
        }

        if (mounted) {
          setIsAppAdmin(resolvedIsAdmin);
          if (__DEV__) {
            logger.log('[AuthProvider] Admin check result:', {
              userId,
              rpcIsAdmin: !error && !!rpcIsAdmin,
              resolvedIsAdmin,
            });
          }
        }
      } catch (e) {
        logger.warn('[AuthProvider] Error checking admin status:', e);
        if (mounted) setIsAppAdmin(false);
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
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
      } catch (e) {
        logger.warn('Error getting session', e);
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
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    } catch (e: any) {
      Alert.alert('Fejl', e.message ?? String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
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
      Alert.alert('Fejl', e.message ?? String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (email: string, token: string) => {
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
    setLoading(true);
    try {
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

  const signInWithFacebook = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: FACEBOOK_REDIRECT_URL,
          scopes: 'email',
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) {
        throw new Error('Facebook login URL mangler.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, FACEBOOK_REDIRECT_URL);

      if (result.type !== 'success') {
        return;
      }

      await completeOAuthSessionFromUrl(result.url);
    } catch (e: any) {
      logger.warn('[AuthProvider] Facebook sign-in error:', e);
      Alert.alert('Fejl', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      if (user?.id) {
        await removeCurrentPushToken(user.id);
      }
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
        signInWithFacebook,
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
