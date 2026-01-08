import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Fill these from env or replace with your values
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'public-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage as any,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

export default supabase;
