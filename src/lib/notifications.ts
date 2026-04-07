import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { navigateFromNotificationData, navigateToHomeFeed, navigationRef } from '../navigation/navigationRef';
import { createHomeDeepLink, getNotificationDeepLinkWithOptions } from './deeplink';
import { logger } from './logger';
import { supabase } from './supabase';

const PUSH_TOKEN_STORAGE_KEY = 'push.currentToken';

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

export interface PushTestResult {
  status: 'sent' | 'not_ready' | 'error';
  sentCount: number;
  queuedCount: number;
  failedCount: number;
  errorMessage?: string;
}

function getProjectId(): string | undefined {
  return (
    Constants?.easConfig?.projectId ??
    (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  );
}

function previewToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function setStoredPushToken(token: string) {
  try {
    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore local storage errors. Remote token registration is the source of truth.
  }
}

async function clearStoredPushToken() {
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore local storage errors.
  }
}

export async function registerForPushNotificationsAsync(options?: {
  promptIfNeeded?: boolean;
}): Promise<PushRegistrationResult> {
  try {
    let token: string | null = null;
    const promptIfNeeded = options?.promptIfNeeded ?? true;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (promptIfNeeded && existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return {
        status: finalStatus === 'denied' ? 'denied' : 'not_setup',
        permissionStatus: finalStatus,
        token: null,
        saved: false,
      };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const projectId = getProjectId();
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    token = tokenResponse.data;

    return {
      status: token ? 'enabled' : 'error',
      permissionStatus: finalStatus,
      token,
      saved: false,
      errorMessage: token ? undefined : 'Ingen push-token blev returneret',
    };
  } catch (error: any) {
    logger.warn('[Push] registerForPushNotificationsAsync failed:', error);
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
  const previousToken = await getStoredPushToken();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { data, error } = await supabase.functions.invoke('claim_push_token', {
    body: {
      pushToken: token,
      previousToken: previousToken && previousToken !== token ? previousToken : null,
      platform,
    },
  });

  if (error) {
    logger.warn('[Push] saveExpoPushToken failed:', error);
    throw error;
  }

  if (data?.ok !== true) {
    logger.warn('[Push] saveExpoPushToken returned non-ok payload:', data);
    throw new Error(data?.error ?? 'Kunne ikke claime push-token');
  }

  if (data?.userId && data.userId !== userId) {
    logger.warn('[Push] saveExpoPushToken claimed token for unexpected user:', {
      expectedUserId: userId,
      actualUserId: data.userId,
    });
    throw new Error('Push-token blev claimed for forkert bruger');
  }

  await setStoredPushToken(token);
}

export async function removeCurrentPushToken(userId: string) {
  const storedToken = await getStoredPushToken();
  if (!storedToken) {
    return;
  }

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('push_token', storedToken);

  if (error) {
    logger.warn('[Push] removeCurrentPushToken failed:', error);
  }

  await clearStoredPushToken();
}

export async function syncPushNotifications(
  userId: string,
  options?: { promptIfNeeded?: boolean },
): Promise<PushRegistrationResult> {
  const registration = await registerForPushNotificationsAsync({
    promptIfNeeded: options?.promptIfNeeded ?? true,
  });

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

export async function sendManualTestPush(userId: string): Promise<PushTestResult> {
  // Hosted requirements:
  // - push_tokens migration applied
  // - authenticated send-push edge function deployed
  // - working Expo projectId / physical device push setup
  const registration = await syncPushNotifications(userId, { promptIfNeeded: false });
  const targetToken = registration.token ?? (await getStoredPushToken());

  if (!targetToken || registration.status !== 'enabled') {
    return {
      status: 'not_ready',
      sentCount: 0,
      queuedCount: 0,
      failedCount: 0,
      errorMessage:
        registration.errorMessage ??
        'Push er ikke aktivt på denne enhed endnu. Aktivér push først.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        toUserId: userId,
        pushToken: targetToken,
        title: 'FCN Fans test-push',
        body: 'Hvis du ser denne besked, virker push på denne enhed.',
        notificationType: 'manual_test',
        dedupeKey: `manual_test:${userId}:${targetToken}:${Date.now()}`,
        data: {
          url: Linking.createURL('/'),
        },
      },
    });

    if (error) {
      logger.warn('[Push] sendManualTestPush failed:', error);
      return {
        status: 'error',
        sentCount: 0,
        queuedCount: 0,
        failedCount: 0,
        errorMessage: error.message ?? 'Kunne ikke sende test-push',
      };
    }

    const queuedCount = typeof data?.queued === 'number' ? data.queued : 0;
    const sentCount = typeof data?.sent === 'number' ? data.sent : 0;
    const failedCount = typeof data?.failed === 'number' ? data.failed : 0;

    if (data?.skipped === 'no token') {
      return {
        status: 'not_ready',
        sentCount,
        queuedCount,
        failedCount,
        errorMessage: 'Ingen registreret push-token blev fundet for denne enhed.',
      };
    }

    if (sentCount > 0) {
      return {
        status: 'sent',
        sentCount,
        queuedCount,
        failedCount,
      };
    }

    return {
      status: 'error',
      sentCount,
      queuedCount,
      failedCount,
      errorMessage: 'Test-push blev ikke sendt.',
    };
  } catch (error: any) {
    logger.warn('[Push] sendManualTestPush threw:', error);
    return {
      status: 'error',
      sentCount: 0,
      queuedCount: 0,
      failedCount: 0,
      errorMessage: error?.message ?? 'Kunne ikke sende test-push',
    };
  }
}

export async function getPushStatusSnapshot(userId: string): Promise<PushStatusSnapshot> {
  const permission = await Notifications.getPermissionsAsync();
  const permissionStatus = permission.status;

  const { data, error } = await supabase
    .from('push_tokens')
    .select('push_token, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn('[Push] getPushStatusSnapshot failed:', error);
    return {
      status: 'error',
      permissionStatus,
      tokenSaved: false,
      savedTokenPreview: null,
    };
  }

  const savedToken = data?.push_token ?? null;

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

export async function openNotificationTarget(data: Record<string, unknown> | null | undefined) {
  if (navigateFromNotificationData(data, { allowHomeFallback: false })) {
    return;
  }

  const url = getNotificationDeepLinkWithOptions(data, { includeHomeFallback: false });
  if (url) {
    try {
      logger.log('[NotificationOpen] deep-link fallback', {
        payload: data ?? null,
        url,
      });
      await Linking.openURL(url);
      return;
    } catch (error) {
      logger.warn('[NotificationOpen] deep-link fallback failed', {
        payload: data ?? null,
        url,
        error,
      });
    }
  }

  logger.log('[NotificationOpen] home fallback', {
    payload: data ?? null,
  });

  if (navigationRef.isReady()) {
    navigateToHomeFeed();
    return;
  }

  await Linking.openURL(createHomeDeepLink());
}
