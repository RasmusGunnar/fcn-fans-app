import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CommunitiesScreen from '../screens/CommunitiesScreen';
import CommunityDetailScreen from '../screens/CommunityDetailScreen';
import CommunityMembersScreen from '../screens/CommunityMembersScreen';
import CreateCommunityScreen from '../screens/CreateCommunityScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';

const Stack = createNativeStackNavigator();

export function CommunitiesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CommunitiesList" component={CommunitiesScreen} />
      <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
      <Stack.Screen name="CommunityMembers" component={CommunityMembersScreen} />
      <Stack.Screen name="CreateCommunity" component={CreateCommunityScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </Stack.Navigator>
  );
}
