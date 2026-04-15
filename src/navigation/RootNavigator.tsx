import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthStack } from './AuthStack';
import { OnboardingStack } from './OnboardingStack';
import { AppTabs } from './AppTabs';
import { useAuth } from '../auth/AuthProvider';
import CreateFanActivityScreen from '../screens/CreateFanActivityScreen';
import CreateNewEventScreen from '../screens/CreateNewEventScreen';
import LoadingScreen from '../screens/LoadingScreen';
import MediaViewerScreen from '../screens/MediaViewerScreen';
import { fetchMyProfile, type UserProfile } from '../services/profileApi';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { navigationRef } from './navigationRef';

const Stack = createNativeStackNavigator();

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

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    try {
      const result = await fetchMyProfile(user.id);
      logger.log('[RootNavigator] Profile load result', {
        profileLoading: false,
        profile: result,
        display_name: result?.display_name ?? null,
        avatar_url: result?.avatar_url ?? null,
        onboarding_complete: result?.onboarding_complete ?? null,
      });
      setProfile(result);
    } catch (error) {
      logger.warn('[RootNavigator] Profile load failed', error);
      setProfile(null);
    } finally {
      setProfileLoading(false);
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
    logger.log('[RootNavigator] Rendering LoadingScreen', {
      loading,
      profileLoading,
      profile,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      onboarding_complete: profile?.onboarding_complete ?? null,
    });
    return <LoadingScreen />;
  }

  if (!user) {
    logger.log('[RootNavigator] Rendering AuthStack', {
      loading,
      profileLoading,
      profile,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      onboarding_complete: profile?.onboarding_complete ?? null,
    });
    return <AuthStack />;
  }

  if (profile && !hasCompletedCoreProfile(profile)) {
    logger.log('[RootNavigator] Rendering OnboardingStack', {
      loading,
      profileLoading,
      profile,
      display_name: profile?.display_name,
      avatar_url: profile?.avatar_url,
      onboarding_complete: profile?.onboarding_complete,
    });
    return <OnboardingStack />;
  }

  logger.log('[RootNavigator] Rendering AppTabs', {
    loading,
    profileLoading,
    profile,
    display_name: profile?.display_name,
    avatar_url: profile?.avatar_url,
    onboarding_complete: profile?.onboarding_complete,
  });
  return <AppTabs />;
}

export function RootNavigator() {
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
      },
    },
    getStateFromPath(path: string, options: any) {
      return defaultGetStateFromPath(normalizeFanActivityDetailPath(path), options);
    },
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Inner} />
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
  );
}
