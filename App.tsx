import React, { useEffect } from 'react';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/auth/AuthProvider';
import { FeedProvider } from './src/state/FeedContext';
import { useAuth } from './src/auth/AuthProvider';
import { syncPushNotifications } from './src/lib/notifications';

function PushTokenRegistrar() {
  const { user } = useAuth();
  useEffect(() => {
    (async () => {
      console.log('[Push] PushTokenRegistrar: user exists =', !!user?.id);
      if (!user?.id) return;

      try {
        const result = await syncPushNotifications(user.id);
        console.log('[Push] PushTokenRegistrar result:', {
          status: result.status,
          permissionStatus: result.permissionStatus,
          tokenReturned: !!result.token,
          tokenSaved: result.saved,
          errorMessage: result.errorMessage,
        });
      } catch (e) {
        console.error('[Push] PushTokenRegistrar failed:', e);
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
