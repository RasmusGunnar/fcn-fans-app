import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import WelcomeScreen from '../screens/WelcomeScreen';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: { mode?: 'login' | 'signup' } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Welcome">
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ title: 'Velkommen' }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
    </Stack.Navigator>
  );
}
