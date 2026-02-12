// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { Screen, Text, Button } from '../components/ui';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const theme = useTheme();

  return (
    <Screen scrollable>
      <View style={{ gap: theme.spacing[3] }}>
        <Text variant="h1">Velkommen</Text>
        <Text variant="body" color="secondary">
          Log ind eller opret en bruger for at komme i gang.
        </Text>
        <Button title="Log ind" onPress={() => navigation.navigate('Login', { mode: 'login' })} />
        <Button
          title="Opret bruger"
          variant="outline"
          onPress={() => navigation.navigate('Login', { mode: 'signup' })}
        />
      </View>
    </Screen>
  );
}
