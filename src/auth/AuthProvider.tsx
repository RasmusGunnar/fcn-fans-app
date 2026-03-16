import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

type User = any;
type Session = any;

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
        // Use RPC function to check admin status (bypasses RLS)
        const { data: isAdmin, error } = await supabase.rpc('is_app_admin');

        if (error) {
          throw error;
        }

        if (mounted) {
          setIsAppAdmin(!!isAdmin);
          if (__DEV__) {
            logger.log('[AuthProvider] Admin check result:', { userId, isAdmin: !!isAdmin });
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
      } catch (e) {
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
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
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

  const signOut = async () => {
    setLoading(true);
    try {
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
