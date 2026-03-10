import { supabase } from './supabase';
import { logger } from './logger';

export async function ensureProfile(userId: string): Promise<boolean> {
  try {
    const payload = {
      id: userId,
      display_name: null,
      avatar_url: null,
      onboarding_complete: false,
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: true } as any);

    if (!error) {
      console.log('[profile] Profile ensured for user:', userId);
      return true;
    }

    console.warn('[profile] Upsert failed, falling back to insert:', error);

    const { error: insertError } = await supabase.from('profiles').insert(payload);

    if (!insertError) {
      console.log('[profile] Profile inserted for user:', userId);
      return true;
    }

    if ((insertError as any)?.code === '23505') {
      console.log('[profile] Profile already exists for user:', userId);
      return true;
    }

    console.warn('[profile] Failed to insert profile:', insertError);
    return false;
  } catch (err) {
    console.warn('[profile] Unexpected error ensuring profile:', err);
    return false;
  }
}

export async function getProfileSafe<T extends Record<string, any>>(
  userId: string,
  select: string,
): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(select)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[profile] Error fetching profile:', error);
      return null;
    }

    if (data) {
      return data as unknown as T;
    }

    console.warn('[profile] Profile missing, attempting to create:', userId);
    const ensured = await ensureProfile(userId);
    if (!ensured) {
      console.warn('[profile] Profile could not be created (RLS or other). Continuing without profile.');
      return null;
    }

    const { data: retryData, error: retryError } = await supabase
      .from('profiles')
      .select(select)
      .eq('id', userId)
      .maybeSingle();

    if (retryError) {
      console.warn('[profile] Error re-fetching profile after ensure:', retryError);
      return null;
    }

    return (retryData as unknown as T) ?? null;
  } catch (err) {
    console.warn('[profile] Unexpected error in getProfileSafe:', err);
    return null;
  }
}