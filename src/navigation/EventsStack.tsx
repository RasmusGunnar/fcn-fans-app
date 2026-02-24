import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EventsScreen from '../screens/EventsScreen';
import MatchDetailsScreen from '../screens/MatchDetailsScreen';
import BusTripDetailsScreen from '../screens/BusTripDetailsScreen';
import EventDetailsScreen from '../screens/EventDetailsScreen';
import EditEventScreen from '../screens/EditEventScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';

const Stack = createNativeStackNavigator();

export function EventsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EventsList" component={EventsScreen} />
      <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
      <Stack.Screen name="BusTripDetails" component={BusTripDetailsScreen} />
      <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
      <Stack.Screen name="EditEvent" component={EditEventScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </Stack.Navigator>
  );
}
