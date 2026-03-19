import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EventAttendeesScreen from '../screens/EventAttendeesScreen';
import HomeScreen from '../screens/HomeScreen';
import MatchDetailsScreen from '../screens/MatchDetailsScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';

const Stack = createNativeStackNavigator();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
      <Stack.Screen name="EventAttendees" component={EventAttendeesScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </Stack.Navigator>
  );
}
