import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthStack } from './AuthStack';
import { OnboardingStack } from './OnboardingStack';
import { AppTabs } from './AppTabs';
import { useAuth } from '../auth/AuthProvider';
import CreateNewEventScreen from '../screens/CreateNewEventScreen';
import LoadingScreen from '../screens/LoadingScreen';
import { fetchMyProfile, type UserProfile } from '../services/profileApi';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

const Stack = createNativeStackNavigator();

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
        }
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
        PostDetail: 'post/:id',
      },
    },
  };

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Inner} />
        <Stack.Screen
          name="CreateNewEvent"
          component={CreateNewEventScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
