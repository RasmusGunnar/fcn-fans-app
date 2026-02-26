import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import LibraryScreen from '../screens/LibraryScreen';

const Stack = createNativeStackNavigator();

export function LibraryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LibraryMain" component={LibraryScreen} />
    </Stack.Navigator>
  );
}
