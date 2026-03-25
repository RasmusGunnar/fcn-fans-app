import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Avatar } from '../Avatar';
import { Card } from '../ui/Card';
import { Text } from '../ui';
import { useTheme, type Theme } from '../../theme';
import type { MentionSuggestion } from '../../services/mentionAutocompleteApi';

type Props = {
  visible: boolean;
  type: 'mention' | 'hashtag' | null;
  mentionSuggestions: MentionSuggestion[];
  hashtagSuggestions: string[];
  onSelectMention: (item: MentionSuggestion) => void;
  onSelectHashtag: (tag: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function EntityAutocompleteList({
  visible,
  type,
  mentionSuggestions,
  hashtagSuggestions,
  onSelectMention,
  onSelectHashtag,
  style,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!visible || !type) {
    return null;
  }

  if (type === 'mention' && mentionSuggestions.length === 0) {
    return null;
  }

  if (type === 'hashtag' && hashtagSuggestions.length === 0) {
    return null;
  }

  return (
    <Card variant="raised" style={[styles.card, style]}>
      <View style={styles.list}>
        {type === 'mention'
          ? mentionSuggestions.map((item, index) => {
              const showDivider = index < mentionSuggestions.length - 1;

              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? styles.rowPressed : null,
                    showDivider ? styles.rowDivider : null,
                  ]}
                  onPress={() => onSelectMention(item)}
                >
                  <Avatar
                    userId={item.id}
                    avatarUrl={item.avatar_url}
                    size={theme.spacing[8]}
                    label={item.display_name || item.username}
                  />
                  <View style={styles.copy}>
                    <Text variant="body" color="primary" style={styles.primaryText}>
                      {item.display_name || item.username}
                    </Text>
                    <Text variant="caption" color="secondary">
                      @{item.username}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          : hashtagSuggestions.map((tag, index) => {
              const showDivider = index < hashtagSuggestions.length - 1;

              return (
                <Pressable
                  key={tag}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? styles.rowPressed : null,
                    showDivider ? styles.rowDivider : null,
                  ]}
                  onPress={() => onSelectHashtag(tag)}
                >
                  <View style={styles.hashBadge}>
                    <Text variant="body" color="primary" style={styles.hashBadgeText}>
                      #
                    </Text>
                  </View>
                  <View style={styles.copy}>
                    <Text variant="body" color="primary" style={styles.primaryText}>
                      #{tag}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
      </View>
    </Card>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      marginTop: theme.spacing[2],
      padding: theme.spacing[0],
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    list: {
      width: '100%',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      backgroundColor: theme.colors.bg.card,
    },
    rowPressed: {
      backgroundColor: theme.colors.bg.subtle,
    },
    rowDivider: {
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.subtle,
    },
    copy: {
      flex: 1,
      gap: theme.spacing[1],
    },
    primaryText: {
      fontWeight: theme.typography.body.fontWeight as any,
    },
    hashBadge: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    hashBadgeText: {
      fontWeight: theme.typography.body.fontWeight as any,
    },
  });
}
