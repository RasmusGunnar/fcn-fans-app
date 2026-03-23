import React from 'react';
import { AuthProvider } from './src/auth/AuthProvider';
import { PushNotificationsBootstrap } from './src/components/PushNotificationsBootstrap';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FeedProvider } from './src/state/FeedContext';

export default function App() {
  return (
    <AuthProvider>
      <FeedProvider>
        <PushNotificationsBootstrap />
        <RootNavigator />
      </FeedProvider>
    </AuthProvider>
  );
}
