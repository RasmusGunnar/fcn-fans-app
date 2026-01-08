import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import AuthStack from './AuthStack';
import AppTabs from './AppTabs';
import { View, ActivityIndicator } from 'react-native';

function Inner() {
  const { user, loading } = useAuth();
  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
  return user ? <AppTabs /> : <AuthStack />;
}

export default function RootNavigator() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Inner />
      </NavigationContainer>
    </AuthProvider>
  );
}
