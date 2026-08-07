import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '../Avatar';
import { Text } from '../ui';
import { useTheme, type Theme } from '../../theme';
import type { GroupMember } from '../../types/messages';

const ROLE_LABEL = { owner: 'Ejer', admin: 'Admin', member: 'Medlem' } as const;

export function GroupMemberRow({
  member,
  canRemove,
  onOpen,
  onRemove,
}: {
  member: GroupMember;
  canRemove: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable style={styles.row} onPress={onOpen} accessibilityRole="button">
      <Avatar
        userId={member.id}
        avatarUrl={member.avatarUrl}
        label={member.displayName}
        size={theme.spacing[11]}
      />
      <View style={styles.copy}>
        <Text variant="bodyBold" numberOfLines={1}>
          {member.displayName}
        </Text>
        <Text variant="small" color="secondary">
          {ROLE_LABEL[member.role]}
        </Text>
      </View>
      {canRemove ? (
        <Pressable
          style={styles.action}
          onPress={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Fjern ${member.displayName}`}
        >
          <Ionicons name="person-remove-outline" size={20} color={theme.colors.state.error} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      minHeight: theme.spacing[16],
      paddingHorizontal: theme.layout.screenPadding,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.card,
    },
    copy: { flex: 1, minWidth: 0 },
    action: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
