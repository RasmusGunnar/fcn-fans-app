import React, { useEffect } from 'react';
import { AuthProvider } from './src/auth/AuthProvider';
import { PushNotificationsBootstrap } from './src/components/PushNotificationsBootstrap';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FeedProvider } from './src/state/FeedContext';
import {
  getRuntimePerformanceStartedAt,
  logPerformanceTiming,
} from './src/utils/performanceTiming';

const runtimeStartedAt = getRuntimePerformanceStartedAt();
logPerformanceTiming('Startup', 'app-module-evaluated', runtimeStartedAt);

export default function App() {
  useEffect(() => {
    logPerformanceTiming('Startup', 'app-mounted', runtimeStartedAt);
  }, []);

  return (
    <AuthProvider>
      <FeedProvider>
        <PushNotificationsBootstrap />
        <RootNavigator />
      </FeedProvider>
    </AuthProvider>
  );
}
