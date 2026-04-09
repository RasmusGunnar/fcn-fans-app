import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { logger } from '../lib/logger';
import {
  openNotificationTarget,
  removeCurrentPushToken,
  syncPushNotifications,
} from '../lib/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function PushNotificationsBootstrap() {
  const { user } = useAuth();
  const syncedUserRef = useRef<string | null>(null);
  const handledResponseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      syncedUserRef.current = null;
      return;
    }

    if (syncedUserRef.current === user.id) {
      return;
    }

    syncedUserRef.current = user.id;
    void syncPushNotifications(user.id, { promptIfNeeded: true }).catch((error) => {
      logger.warn('[PushNotificationsBootstrap] Token sync failed:', error);
    });
  }, [user?.id]);

  useEffect(() => {
    let currentAppState: AppStateStatus = AppState.currentState;

    const syncOnForeground = async () => {
      if (!user?.id) {
        return;
      }

      try {
        const { status } = await Notifications.getPermissionsAsync();

        if (status !== 'granted') {
          await removeCurrentPushToken(user.id);
          return;
        }

        await syncPushNotifications(user.id, { promptIfNeeded: false });
      } catch (error) {
        logger.warn('[PushNotificationsBootstrap] Foreground push sync failed:', error);
      }
    };

    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      const wasInBackground = currentAppState === 'background' || currentAppState === 'inactive';
      currentAppState = nextAppState;

      if (wasInBackground && nextAppState === 'active') {
        void syncOnForeground();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [user?.id]);

  useEffect(() => {
    const handleResponse = async (response: Notifications.NotificationResponse | null) => {
      if (!response) return;

      const responseId = response.notification.request.identifier;
      if (handledResponseRef.current === responseId) {
        return;
      }

      handledResponseRef.current = responseId;

      try {
        await openNotificationTarget(response.notification.request.content.data as Record<
          string,
          unknown
        >);
      } catch (error) {
        logger.warn('[PushNotificationsBootstrap] Notification open failed:', error);
      }
    };

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // Foreground presentation is handled by Notifications.setNotificationHandler above.
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });

    void (async () => {
      const response = await Notifications.getLastNotificationResponseAsync();

      try {
        await Notifications.clearLastNotificationResponseAsync();
      } catch (error) {
        logger.warn(
          '[PushNotificationsBootstrap] Failed to clear last notification response:',
          error,
        );
      }

      await handleResponse(response);
    })();

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return null;
}
