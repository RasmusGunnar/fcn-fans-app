import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingProfileSetupScreen from '../screens/onboarding/OnboardingProfileSetupScreen';
import OnboardingCommunitiesSetupScreen from '../screens/onboarding/OnboardingCommunitiesSetupScreen';

export type OnboardingStackParamList = {
  OnboardingProfile: { step: number; totalSteps: number } | undefined;
  OnboardingCommunities: { step: number; totalSteps: number } | undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator
      initialRouteName="OnboardingProfile"
      screenOptions={{ headerShown: false, gestureEnabled: false }}
    >
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