import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthProvider';
import { logger } from '../lib/logger';
import { openNotificationTarget, syncPushNotifications } from '../lib/notifications';

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

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      void handleResponse(response);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return null;
}
