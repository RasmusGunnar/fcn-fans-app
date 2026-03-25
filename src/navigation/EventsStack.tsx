import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import BusTripDetailsScreen from '../screens/BusTripDetailsScreen';
import EditEventScreen from '../screens/EditEventScreen';
import EventAttendeesScreen from '../screens/EventAttendeesScreen';
import EventDetailsScreen from '../screens/EventDetailsScreen';
import EventsScreen from '../screens/EventsScreen';
import HashtagScreen from '../screens/HashtagScreen';
import MatchDetailsScreen from '../screens/MatchDetailsScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';

const Stack = createNativeStackNavigator();

export function EventsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EventsList" component={EventsScreen} />
      <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
      <Stack.Screen name="BusTripDetails" component={BusTripDetailsScreen} />
      <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
      <Stack.Screen name="EventAttendees" component={EventAttendeesScreen} />
      <Stack.Screen name="EditEvent" component={EditEventScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="Hashtag" component={HashtagScreen} />
    </Stack.Navigator>
  );
}
