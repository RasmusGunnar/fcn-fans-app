import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../screens/ProfileScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';

const Stack = createNativeStackNavigator();

export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      {/* Future: Add nested screens like Settings, Notifications, etc. */}
    </Stack.Navigator>
  );
}
