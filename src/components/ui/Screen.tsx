import React from 'react';
import { View, ViewProps, ScrollView, ScrollViewProps } from 'react-native';
import { defaultTheme } from '../../theme';

export interface ScreenProps extends Omit<ViewProps, 'style'> {
  scrollable?: boolean;
  scrollViewProps?: Omit<ScrollViewProps, 'style'>;
  style?: ViewProps['style'];
  children?: React.ReactNode;
}

/**
 * Themed Screen container component
 * 
 * DO NOT hardcode padding or background colors
 * Use this component for all screen containers
 * 
 * Examples:
 *   <Screen>Content</Screen>
 *   <Screen scrollable>Scrollable content</Screen>
 */
export function Screen({
  scrollable = false,
  scrollViewProps,
  style,
  children,
  ...props
}: ScreenProps) {
  const theme = defaultTheme;
  
  const containerStyle = {
    flex: 1,
    backgroundColor: theme.colors.bg.canvas,
  };
  
  const contentStyle = {
    padding: theme.layout.screenPadding,
  };
  
  if (scrollable) {
    return (
      <View style={containerStyle}>
        <ScrollView
          contentContainerStyle={[contentStyle, style]}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      </View>
    );
  }
  
  return (
    <View style={[containerStyle, contentStyle, style]} {...props}>
      {children}
    </View>
  );
}
