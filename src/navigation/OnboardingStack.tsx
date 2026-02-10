import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingProfileSetupScreen from '../screens/onboarding/OnboardingProfileSetupScreen';
import OnboardingCommunitiesSetupScreen from '../screens/onboarding/OnboardingCommunitiesSetupScreen';

export type OnboardingStackParamList = {
  OnboardingProfile: undefined;
  OnboardingCommunities: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="OnboardingProfile">
      <Stack.Screen name="OnboardingProfile" component={OnboardingProfileSetupScreen} />
      <Stack.Screen name="OnboardingCommunities" component={OnboardingCommunitiesSetupScreen} />
    </Stack.Navigator>
  );
}
