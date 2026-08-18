import React, { useEffect } from 'react';
import { AuthProvider } from './src/auth/AuthProvider';
import { PushNotificationsBootstrap } from './src/components/PushNotificationsBootstrap';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FeedProvider } from './src/state/FeedContext';
import { NotificationUnreadProvider } from './src/state/NotificationUnreadContext';
import { MessageUnreadProvider } from './src/state/MessageUnreadContext';
import { StadiumReactionProvider } from './src/state/StadiumReactionContext';
import { IncomingShareProvider } from './src/state/IncomingShareContext';
import { MatchdayStateProvider } from './src/state/MatchdayStateContext';
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
      <IncomingShareProvider>
        <NotificationUnreadProvider>
          <MessageUnreadProvider>
            <MatchdayStateProvider>
              <StadiumReactionProvider>
                <FeedProvider>
                  <PushNotificationsBootstrap />
                  <RootNavigator />
                </FeedProvider>
              </StadiumReactionProvider>
            </MatchdayStateProvider>
          </MessageUnreadProvider>
        </NotificationUnreadProvider>
      </IncomingShareProvider>
    </AuthProvider>
  );
}
