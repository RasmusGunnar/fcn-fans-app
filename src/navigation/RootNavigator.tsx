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

const Stack = createNativeStackNavigator();

function isProfileComplete(profile: UserProfile | null): boolean {
  if (!profile) return false;

  const hasDisplayName =
    typeof profile.display_name === 'string' && profile.display_name.trim().length > 0;

  return hasDisplayName && profile.onboarding_complete === true;
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
      setProfile(result);
    } catch {
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
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthStack />;
  }

  if (!isProfileComplete(profile)) {
    return <OnboardingStack />;
  }

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