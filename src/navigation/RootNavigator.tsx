import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  NavigationContainer,
  getStateFromPath as defaultGetStateFromPath,
} from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthProvider';
import LoadingScreen from '../screens/LoadingScreen';
import { fetchStartupProfile, type UserProfile } from '../services/profileApi';
import { supabase } from '../lib/supabase';
import { flushPendingNotificationNavigation, navigationRef } from './navigationRef';
import {
  logPerformanceEvent,
  logPerformanceTiming,
  performanceNow,
  setPerformanceActiveRoute,
  startJsThreadLagDetector,
} from '../utils/performanceTiming';
import { AppTabs } from './AppTabs';
import { useIncomingShare } from '../state/IncomingShareContext';

const Stack = createNativeStackNavigator();
const AuthStack = React.lazy(() =>
  import('./AuthStack').then((module) => ({ default: module.AuthStack })),
);
const OnboardingStack = React.lazy(() =>
  import('./OnboardingStack').then((module) => ({ default: module.OnboardingStack })),
);
const CreateFanActivityScreen = React.lazy(() => import('../screens/CreateFanActivityScreen'));
const CreateNewEventScreen = React.lazy(() => import('../screens/CreateNewEventScreen'));
const MediaViewerScreen = React.lazy(() => import('../screens/MediaViewerScreen'));
const MessagesStack = React.lazy(() =>
  import('./MessagesStack').then((module) => ({ default: module.MessagesStack })),
);
const IncomingShareScreen = React.lazy(() => import('../screens/IncomingShareScreen'));
const SharePostComposerScreen = React.lazy(() => import('../screens/SharePostComposerScreen'));

function normalizeFanActivityDetailPath(path: string): string {
  const normalizedPath = path.replace(/^\/+/, '');
  const [pathname, queryString = ''] = normalizedPath.split('?');
  const fanActivitySearchParams = new URLSearchParams(queryString);

  const matchFanActivityMatch = pathname.match(/^match\/([^/]+)\/fan-activity\/([^/]+)$/);
  if (matchFanActivityMatch) {
    fanActivitySearchParams.set('fanActivityId', decodeURIComponent(matchFanActivityMatch[2]));
    const search = fanActivitySearchParams.toString();
    return `match/${decodeURIComponent(matchFanActivityMatch[1])}${search ? `?${search}` : ''}`;
  }

  const eventFanActivityMatch = pathname.match(/^event\/([^/]+)\/fan-activity\/([^/]+)$/);
  if (eventFanActivityMatch) {
    fanActivitySearchParams.set('fanActivityId', decodeURIComponent(eventFanActivityMatch[2]));
    const search = fanActivitySearchParams.toString();
    return `event/${decodeURIComponent(eventFanActivityMatch[1])}${search ? `?${search}` : ''}`;
  }

  return normalizedPath;
}

function hasCompletedCoreProfile(profile: UserProfile | null): boolean {
  if (!profile) return false;

  return typeof profile.display_name === 'string' && profile.display_name.trim().length > 0;
}

function Inner() {
  const { user, loading } = useAuth();
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const loadedProfileUserIdRef = useRef<string | null>(null);
  const profileRequestIdRef = useRef(0);

  const loadProfile = useCallback(async () => {
    const requestId = ++profileRequestIdRef.current;

    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      loadedProfileUserIdRef.current = null;
      return;
    }

    const isInitialLoadForUser = loadedProfileUserIdRef.current !== user.id;
    if (isInitialLoadForUser) {
      setProfileLoading(true);
    }
    const profileStartedAt = performanceNow();

    try {
      const result = await fetchStartupProfile(user.id);
      if (profileRequestIdRef.current !== requestId) {
        return;
      }
      logPerformanceTiming('Profile', 'startup-profile', profileStartedAt, {
        found: Boolean(result),
        hasDisplayName: Boolean(result?.display_name?.trim()),
        blockingNavigation: isInitialLoadForUser,
      });
      setProfile(result);
    } catch (error) {
      if (profileRequestIdRef.current !== requestId) {
        return;
      }
      logPerformanceTiming('Profile', 'startup-profile-error', profileStartedAt, {
        message: error instanceof Error ? error.message : String(error),
        blockingNavigation: isInitialLoadForUser,
      });
      setProfile(null);
    } finally {
      if (profileRequestIdRef.current === requestId) {
        loadedProfileUserIdRef.current = user.id;
        setProfileLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          void loadProfile();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadProfile, user?.id]);

  if (loading || profileLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthStack />;
  }

  if (profile && !hasCompletedCoreProfile(profile)) {
    return <OnboardingStack />;
  }

  return <AppTabs />;
}

function ProtectedMessagesStack() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthStack />;
  return <MessagesStack />;
}

function ProtectedIncomingShareScreen() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthStack />;
  return <IncomingShareScreen />;
}

function ProtectedSharePostComposerScreen() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthStack />;
  return <SharePostComposerScreen />;
}

export function RootNavigator() {
  const { user } = useAuth();
  const { pendingShare } = useIncomingShare();
  const previousRouteNameRef = useRef<string | null>(null);

  const openPendingShare = useCallback(() => {
    if (!user?.id || !pendingShare || !navigationRef.isReady()) return;
    if (navigationRef.getCurrentRoute()?.name !== 'IncomingShare') {
      navigationRef.navigate('IncomingShare');
    }
  }, [pendingShare, user?.id]);

  useEffect(() => startJsThreadLagDetector(), []);

  const handleNavigationReady = useCallback(() => {
    const routeName = navigationRef.getCurrentRoute()?.name ?? null;
    previousRouteNameRef.current = routeName;
    setPerformanceActiveRoute(routeName);
    logPerformanceEvent('Navigation', 'container-ready', { routeName });
    flushPendingNotificationNavigation();
    openPendingShare();
  }, [openPendingShare]);

  useEffect(() => {
    openPendingShare();
  }, [openPendingShare]);

  const handleNavigationStateChange = useCallback(() => {
    const nextRouteName = navigationRef.getCurrentRoute()?.name ?? null;
    const previousRouteName = previousRouteNameRef.current;

    setPerformanceActiveRoute(nextRouteName);
    logPerformanceEvent('Navigation', 'state-changed', {
      previousRoute: previousRouteName,
      nextRoute: nextRouteName,
    });
    previousRouteNameRef.current = nextRouteName;
  }, []);

  const linking = {
    prefixes: [Linking.createURL('/'), 'fcnfans://'],
    config: {
      screens: {
        Main: {
          screens: {
            Home: {
              screens: {
                HomeMain: 'home',
                MatchDetails: 'match/:fixtureId',
                StadiumLive: 'stadium/:eventId',
                PostDetail: 'post/:postId',
              },
            },
            Events: {
              screens: {
                EventsList: 'events',
                EventDetails: 'event/:eventId',
                BusTripDetails: 'bus-trip/:busTripId',
              },
            },
            Profile: {
              screens: {
                ProfileMain: 'profile',
                Notifications: 'notifications',
              },
            },
          },
        },
        Messages: {
          path: 'messages',
          screens: {
            MessagesList: '',
            Conversation: ':conversationId',
            NewMessage: 'new',
            GroupInfo: ':conversationId/info',
          },
        },
        IncomingShare: 'incoming-share',
      },
    },
    getStateFromPath(path: string, options: any) {
      return defaultGetStateFromPath(normalizeFanActivityDetailPath(path), options);
    },
  };

  return (
    <Suspense fallback={<LoadingScreen />}>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={handleNavigationReady}
        onStateChange={handleNavigationStateChange}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={Inner} />
          <Stack.Screen name="Messages" component={ProtectedMessagesStack} />
          <Stack.Screen name="IncomingShare" component={ProtectedIncomingShareScreen} />
          <Stack.Screen
            name="SharePostComposer"
            component={ProtectedSharePostComposerScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="CreateNewEvent"
            component={CreateNewEventScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="CreateFanActivity"
            component={CreateFanActivityScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="MediaViewer"
            component={MediaViewerScreen}
            options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: true }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </Suspense>
  );
}
