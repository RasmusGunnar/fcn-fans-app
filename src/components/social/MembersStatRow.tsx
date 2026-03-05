import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';

interface MembersStatRowProps {
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  valueText: string;
  avatars: string[];
  onPress?: () => void;
  actionText?: string;
  horizontalPadding?: number;
  showBorders?: boolean;
  marginBottom?: number;
}

export function MembersStatRow({
  iconName = 'people',
  label,
  valueText,
  avatars,
  onPress,
  actionText,
  horizontalPadding,
  showBorders = true,
  marginBottom,
}: MembersStatRowProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const content = (
    <View
      style={[
        styles.row,
        {
          paddingHorizontal: horizontalPadding ?? theme.spacing[4],
          marginBottom: marginBottom ?? theme.spacing[2],
        },
        showBorders ? styles.rowBorders : null,
      ]}
    >
      <View style={styles.left}>
        <Ionicons 
          name={iconName} 
          size={theme.components.icon.size.sm} 
          color={theme.colors.text.secondary} 
          style={{ marginRight: theme.spacing[2] }}
        />
        
        {avatars.length > 0 && (
          <View style={[styles.avatars, { marginRight: theme.spacing[2] }]}>
            {avatars.slice(0, 4).map((avatarUrl, index) => (
              <View
                key={`${avatarUrl}-${index}`}
                style={[styles.avatarBubble, { marginLeft: index > 0 ? -theme.spacing[2] : 0 }]}
              >
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              </View>
            ))}
          </View>
        )}

        <Text style={styles.valueText}>{valueText}</Text>
      </View>

      {actionText ? (
        <Text style={styles.actionText}>{actionText}</Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing[2],
    },
    rowBorders: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.default,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    label: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
    },
    avatars: {
      flexDirection: 'row',
    },
    avatarBubble: {
      width: theme.spacing[7],
      height: theme.spacing[7],
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: theme.colors.bg.card,
      backgroundColor: theme.colors.bg.elevated,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    valueText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      fontWeight: '600',
    },
    actionText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    pressed: {
      opacity: 0.8,
    },
  });