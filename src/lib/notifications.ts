import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type PushUiStatus = 'enabled' | 'denied' | 'not_setup' | 'error';

export interface PushRegistrationResult {
  status: PushUiStatus;
  permissionStatus: string;
  token: string | null;
  saved: boolean;
  errorMessage?: string;
}

export interface PushStatusSnapshot {
  status: PushUiStatus;
  permissionStatus: string;
  tokenSaved: boolean;
  savedTokenPreview: string | null;
}

function getProjectId(): string | undefined {
  return (
    Constants?.easConfig?.projectId ??
    (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  );
}

function previewToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return `${token.slice(0, 10)}…${token.slice(-6)}`;
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  console.log('[Push] registerForPushNotificationsAsync: start');
  try {
    let token: string | null = null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[Push] existing permission status:', existingStatus);

    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[Push] requested permission status:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.warn('[Push] permission not granted');
      return {
        status: 'denied',
        permissionStatus: finalStatus,
        token: null,
        saved: false,
      };
    }

    const projectId = getProjectId();
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    token = tokenResponse.data;
    console.log('[Push] expo token returned:', previewToken(token));

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
      console.log('[Push] android notification channel set');
    }

    return {
      status: token ? 'enabled' : 'error',
      permissionStatus: finalStatus,
      token,
      saved: false,
      errorMessage: token ? undefined : 'Ingen push-token blev returneret',
    };
  } catch (error: any) {
    console.error('[Push] registerForPushNotificationsAsync failed:', error);
    return {
      status: 'error',
      permissionStatus: 'error',
      token: null,
      saved: false,
      errorMessage: error?.message ?? 'Ukendt fejl ved push-registrering',
    };
  }
}

export async function saveExpoPushToken(userId: string, token: string) {
  console.log('[Push] saveExpoPushToken: start for user', userId);
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, expo_push_token: token }, { onConflict: 'id' });
  if (error) {
    console.error('[Push] saveExpoPushToken failed:', error);
    throw error;
  }
  console.log('[Push] saveExpoPushToken: success', previewToken(token));
}

export async function syncPushNotifications(userId: string): Promise<PushRegistrationResult> {
  console.log('[Push] syncPushNotifications: user exists =', !!userId);
  const registration = await registerForPushNotificationsAsync();

  if (!registration.token) {
    return registration;
  }

  try {
    await saveExpoPushToken(userId, registration.token);
    return { ...registration, saved: true, status: 'enabled' };
  } catch (error: any) {
    return {
      ...registration,
      status: 'error',
      saved: false,
      errorMessage: error?.message ?? 'Kunne ikke gemme push-token',
    };
  }
}

export async function getPushStatusSnapshot(userId: string): Promise<PushStatusSnapshot> {
  const permission = await Notifications.getPermissionsAsync();
  const permissionStatus = permission.status;

  const { data, error } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Push] getPushStatusSnapshot failed:', error);
    return {
      status: 'error',
      permissionStatus,
      tokenSaved: false,
      savedTokenPreview: null,
    };
  }

  const savedToken = data?.expo_push_token ?? null;

  if (permissionStatus === 'denied') {
    return {
      status: 'denied',
      permissionStatus,
      tokenSaved: !!savedToken,
      savedTokenPreview: previewToken(savedToken),
    };
  }

  if (permissionStatus === 'granted' && savedToken) {
    return {
      status: 'enabled',
      permissionStatus,
      tokenSaved: true,
      savedTokenPreview: previewToken(savedToken),
    };
  }

  return {
    status: 'not_setup',
    permissionStatus,
    tokenSaved: false,
    savedTokenPreview: null,
  };
}
