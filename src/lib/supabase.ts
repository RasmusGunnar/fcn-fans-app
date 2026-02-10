import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Minimal local declaration for process.env in React Native environment
declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
  };
};

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  '';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  '';

const missingVars: string[] = [];
if (!supabaseUrl) missingVars.push('EXPO_PUBLIC_SUPABASE_URL (fallback: SUPABASE_URL)');
if (!supabaseAnonKey) missingVars.push('EXPO_PUBLIC_SUPABASE_ANON_KEY (fallback: SUPABASE_ANON_KEY)');

let urlOk = true;
try {
  if (supabaseUrl) {
    const u = new URL(supabaseUrl);
    urlOk = u.protocol === 'https:';
  }
} catch {
  urlOk = false;
}

if (!urlOk) {
  console.error(
    'Invalid Supabase URL. Must be a valid https:// URL. Set EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL).',
  );
}
if (missingVars.length > 0) {
  console.error(
    `Missing Supabase env vars: ${missingVars.join(', ')}. ` +
      `Set them in EAS Environment Variables (Production).`,
  );
}

// Create a client that won't crash app import time.
// If config is missing, it will still exist, but any usage should be considered invalid.
export const supabase = createClient(
  supabaseUrl || 'https://invalid.local',
  supabaseAnonKey || 'invalid',
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
