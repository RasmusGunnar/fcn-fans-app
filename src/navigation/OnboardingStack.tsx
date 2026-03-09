import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingProfileSetupScreen from '../screens/onboarding/OnboardingProfileSetupScreen';
import OnboardingCommunitiesSetupScreen from '../screens/onboarding/OnboardingCommunitiesSetupScreen';

export type OnboardingStackParamList = {
  Welcome: undefined;
  Login: { mode?: 'login' | 'signup' } | undefined;
  OnboardingProfile: { step: number; totalSteps: number } | undefined;
  OnboardingCommunities: { step: number; totalSteps: number } | undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Welcome">
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="OnboardingProfile"
        component={OnboardingProfileSetupScreen}
        initialParams={{ step: 1, totalSteps: 2 }}
      />
      <Stack.Screen
        name="OnboardingCommunities"
        component={OnboardingCommunitiesSetupScreen}
        initialParams={{ step: 2, totalSteps: 2 }}
      />
    </Stack.Navigator>
  );
}
