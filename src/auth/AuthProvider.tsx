import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import supabase from '../lib/supabase';

type User = any;

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInWithOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setUser(data.session?.user ?? null);
      } catch (e) {
        console.warn('Error getting session', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      // unsubscribe
      try { data.subscription.unsubscribe(); } catch (e) { /* ignore */ }
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
      // This triggers the OAuth flow; on mobile you may prefer native Apple sign-in
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple' as any });
      if (error) throw error;
    } catch (e: any) {
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
      console.warn('Sign out error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithOtp, verifyOtp, signInWithApple, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
