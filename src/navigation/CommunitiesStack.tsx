import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CommunitiesScreen from '../screens/CommunitiesScreen';
import CommunityDetailScreen from '../screens/CommunityDetailScreen';
import CommunityMembersScreen from '../screens/CommunityMembersScreen';
import CreateCommunityScreen from '../screens/CreateCommunityScreen';
import HashtagScreen from '../screens/HashtagScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import { logPerformanceEvent } from '../utils/performanceTiming';

logPerformanceEvent('LazyStack', 'module-evaluated', { stackName: 'CommunitiesStack' });

const Stack = createNativeStackNavigator();

export function CommunitiesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CommunitiesList" component={CommunitiesScreen} />
      <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
      <Stack.Screen name="CommunityMembers" component={CommunityMembersScreen} />
      <Stack.Screen name="CreateCommunity" component={CreateCommunityScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen name="Hashtag" component={HashtagScreen} />
    </Stack.Navigator>
  );
}
