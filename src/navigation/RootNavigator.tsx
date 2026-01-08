import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';
import { useAuth } from '../auth/AuthProvider';

function Inner() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <AppTabs /> : <AuthStack />;
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Inner />
    </NavigationContainer>
  );
}
