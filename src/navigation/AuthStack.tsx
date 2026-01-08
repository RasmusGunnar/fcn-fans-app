import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/WelcomeScreen';
import EmailOtpScreen from '../screens/EmailOtpScreen';

const Stack = createNativeStackNavigator();

export function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Welcome">
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EmailOtp" component={EmailOtpScreen} options={{ title: 'Indtast kode' }} />
    </Stack.Navigator>
  );
}

export default AuthStack;
