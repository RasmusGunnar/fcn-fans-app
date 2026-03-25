import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminFanFactionRequestsScreen from '../screens/AdminFanFactionRequestsScreen';
import HashtagScreen from '../screens/HashtagScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';

const Stack = createNativeStackNavigator();

export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="Hashtag" component={HashtagScreen} />
      <Stack.Screen name="AdminFanFactionRequests" component={AdminFanFactionRequestsScreen} />
      {/* Future: Add nested screens like Settings, Notifications, etc. */}
    </Stack.Navigator>
  );
}
