import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import { Card } from '../ui/Card';

export interface CardShellProps {
  children: React.ReactNode;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * CardShell - Tynd wrapper omkring UI Card komponenten
 * 
 * Tilføjer Pressable funktionalitet hvis onPress er angivet,
 * ellers renderer en standard Card.
 * 
 * Bevarer Card's eksisterende padding/radius/shadow styling.
 */
export function CardShell({
  children,
  onPress,
  testID,
  style,
}: CardShellProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card style={style}>
          {children}
        </Card>
      </Pressable>
    );
  }

  return (
    <Card testID={testID} style={style}>
      {children}
    </Card>
  );
}
