import React, { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FeedProvider } from './src/state/FeedContext';
import {
  getRuntimePerformanceStartedAt,
  logPerformanceTiming,
} from './src/utils/performanceTiming';

const runtimeStartedAt = getRuntimePerformanceStartedAt();
logPerformanceTiming('Startup', 'app-module-evaluated', runtimeStartedAt);

function PushTokenRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const { registerForPushNotificationsAsync, saveExpoPushToken } =
          await import('./src/lib/notifications');
        if (cancelled) {
          return;
        }

        const result = await registerForPushNotificationsAsync();
        if (result.token) {
          try {
            await saveExpoPushToken(user.id, result.token);
          } catch {
            // Push registration must not block or disrupt startup.
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [user?.id]);

  return null;
}

export default function App() {
  useEffect(() => {
    logPerformanceTiming('Startup', 'app-mounted', runtimeStartedAt);
  }, []);

  return (
    <AuthProvider>
      <FeedProvider>
        <PushTokenRegistrar />
        <RootNavigator />
      </FeedProvider>
    </AuthProvider>
  );
}
