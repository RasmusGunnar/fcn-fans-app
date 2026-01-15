import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';
import { useAuth } from '../auth/AuthProvider';
import CreateScreen from '../screens/CreateScreen';
import CommunityDetailScreen from '../screens/CommunityDetailScreen';
import MatchDetailsScreen from '../screens/MatchDetailsScreen';
import BusTripDetailsScreen from '../screens/BusTripDetailsScreen';

const Stack = createNativeStackNavigator();

function Inner() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <AppTabs /> : <AuthStack />;
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Inner} />
        <Stack.Screen name="Create" component={CreateScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
        <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
        <Stack.Screen name="BusTripDetails" component={BusTripDetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
