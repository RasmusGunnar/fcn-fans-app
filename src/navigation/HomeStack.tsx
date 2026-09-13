import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import { logPerformanceEvent } from '../utils/performanceTiming';

logPerformanceEvent('LazyStack', 'module-evaluated', { stackName: 'HomeStack' });

const Stack = createNativeStackNavigator();
const EventAttendeesScreen = React.lazy(() => import('../screens/EventAttendeesScreen'));
const HashtagScreen = React.lazy(() => import('../screens/HashtagScreen'));
const MatchDetailsScreen = React.lazy(() => import('../screens/MatchDetailsScreen'));
const PostDetailScreen = React.lazy(() => import('../screens/PostDetailScreen'));
const PublicProfileScreen = React.lazy(() => import('../screens/PublicProfileScreen'));

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
      <Stack.Screen name="EventAttendees" component={EventAttendeesScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="Hashtag" component={HashtagScreen} />
    </Stack.Navigator>
  );
}
