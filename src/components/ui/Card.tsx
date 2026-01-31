import React from 'react';
import { View, ViewProps, StyleSheet, ImageBackground, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { defaultTheme, getShadowStyle } from '../../theme';

export interface CardProps extends Omit<ViewProps, 'style'> {
  variant?: 'default' | 'raised' | 'imageHeader' | 'feedItem';
  imageSource?: ImageSourcePropType;
  style?: ViewProps['style'];
  children?: React.ReactNode;
}

/**
 * Themed Card component
 * 
 * DO NOT hardcode borderRadius, padding, shadows, or colors
 * Use variant prop to control elevation and appearance
 * 
 * Examples:
 *   <Card variant="default">Basic card</Card>
 *   <Card variant="raised">Elevated card</Card>
 *   <Card variant="imageHeader" imageSource={...}>Card with image header</Card>
 */
export function Card({
  variant = 'default',
  imageSource,
  style,
  children,
  ...props
}: CardProps) {
  const theme = defaultTheme;
  const styles = createStyles(theme);
  
  // Handle feedItem variant differently
  if (variant === 'feedItem') {
    return (
      <View
        style={[
          {
            backgroundColor: theme.colors.bg.card,
            borderRadius: theme.components.card.variants.feedItem.borderRadius,
            borderBottomWidth: theme.components.card.variants.feedItem.borderBottomWidth,
            borderBottomColor: theme.colors.border.light,
            overflow: 'hidden' as const,
          },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }
  
  const elevationLevel = variant === 'raised' 
    ? theme.components.card.elevationRaised 
    : theme.components.card.elevationDefault;
  
  const shadowStyle = getShadowStyle(theme, elevationLevel);
  
  const baseStyle = {
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.components.card.borderRadius,
    overflow: 'hidden' as const,
  };
  
  if (variant === 'imageHeader' && imageSource) {
    return (
      <View style={[baseStyle, shadowStyle, style]} {...props}>
        <ImageBackground
          source={imageSource}
          style={styles.imageHeader}
          resizeMode="cover"
        >
          <LinearGradient
            colors={theme.gradients.imageHeaderOverlay.colors}
            locations={theme.gradients.imageHeaderOverlay.locations}
            start={theme.gradients.imageHeaderOverlay.start}
            end={theme.gradients.imageHeaderOverlay.end}
            style={styles.gradient}
          />
        </ImageBackground>
        <View style={{ padding: theme.components.card.padding }}>
          {children}
        </View>
      </View>
    );
  }
  
  return (
    <View
      style={[
        baseStyle,
        shadowStyle,
        { padding: theme.components.card.padding },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

function createStyles(theme: typeof defaultTheme) {
  return StyleSheet.create({
    imageHeader: {
      height: 200,
      width: '100%',
    },
    gradient: {
      flex: 1,
    },
  });
}
