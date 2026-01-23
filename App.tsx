import React, { useEffect } from 'react';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/auth/AuthProvider';
import { FeedProvider } from './src/state/FeedContext';
import { useAuth } from './src/auth/AuthProvider';
import { registerForPushNotificationsAsync, saveExpoPushToken } from './src/lib/notifications';

function PushTokenRegistrar() {
  const { user } = useAuth();
  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const token = await registerForPushNotificationsAsync();
      if (token) {
        try {
          await saveExpoPushToken(user.id, token);
        } catch (e) {
          /* ignore */
        }
      }
    })();
  }, [user?.id]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <FeedProvider>
        <PushTokenRegistrar />
        <RootNavigator />
      </FeedProvider>
    </AuthProvider>
  );
}
