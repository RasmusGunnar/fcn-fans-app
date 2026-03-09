import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStack } from './AuthStack';
import { OnboardingStack } from './OnboardingStack';
import { AppTabs } from './AppTabs';
import { useAuth } from '../auth/AuthProvider';
import CreateScreen from '../screens/CreateScreen';
import CreateNewEventScreen from '../screens/CreateNewEventScreen';
import LoadingScreen from '../screens/LoadingScreen';
import { fetchMyProfile, type UserProfile } from '../services/profileApi';

const Stack = createNativeStackNavigator();

const isProfileComplete = (profile: UserProfile | null): boolean => {
  if (!profile) return false;
  const hasName = typeof profile.display_name === 'string' && profile.display_name.trim().length > 0;
  return profile.onboarding_complete === true && hasName;
};

function Inner() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      return () => {
        mounted = false;
      };
    }

    setProfileLoading(true);
    (async () => {
      const data = await fetchMyProfile(user.id);
      if (!mounted) return;
      setProfile(data);
      setProfileLoading(false);
      if (!isProfileComplete(data)) {
        console.warn('[RootNavigator] Profile incomplete, gating onboarding flow.');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  if (loading || (user && profileLoading)) return <LoadingScreen />;

  if (!user) return <AuthStack />;
  if (!profile || !isProfileComplete(profile)) return <OnboardingStack />;
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
        <Stack.Screen name="Create" component={CreateScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="CreateNewEvent"
          component={CreateNewEventScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
