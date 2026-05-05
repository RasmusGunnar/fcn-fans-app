import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Avatar } from '../Avatar';
import { useTheme } from '../../theme';
import { Text } from '../ui';

export type MatchFanStatus = 'checked_in' | 'going';

export interface MatchFanListItem {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  status: MatchFanStatus;
}

interface MatchFanListProps {
  items: MatchFanListItem[];
  maxVisible?: number;
  totalCount?: number;
  emptyText?: string;
  variant?: 'compact' | 'full';
  style?: StyleProp<ViewStyle>;
  highfiveEnabled?: boolean;
  currentUserId?: string | null;
  highfivedUserIds?: ReadonlySet<string>;
  pendingHighfiveUserIds?: ReadonlySet<string>;
  onHighfive?: (userId: string) => void;
}

export function MatchFanList({
  items,
  maxVisible,
  totalCount,
  emptyText,
  variant = 'compact',
  style,
  highfiveEnabled = false,
  currentUserId,
  highfivedUserIds,
  pendingHighfiveUserIds,
  onHighfive,
}: MatchFanListProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const visibleItems = useMemo(
    () => (typeof maxVisible === 'number' ? items.slice(0, maxVisible) : items),
    [items, maxVisible],
  );
  const effectiveTotalCount = Math.max(totalCount ?? items.length, items.length);
  const remainingCount = Math.max(0, effectiveTotalCount - visibleItems.length);
  const isCompact = variant === 'compact';

  if (visibleItems.length === 0) {
    if (!emptyText) {
      return null;
    }

    return (
      <View style={[styles.emptyWrap, style]}>
        <Text variant="caption" color="secondary" style={styles.emptyText}>
          {emptyText}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isCompact ? styles.containerCompact : null, style]}>
      {visibleItems.map((item) => {
        const isCheckedIn = item.status === 'checked_in';
        const hasHighfived = highfivedUserIds?.has(item.userId) ?? false;
        const isPendingHighfive = pendingHighfiveUserIds?.has(item.userId) ?? false;
        const canShowHighfive =
          !isCompact &&
          highfiveEnabled &&
          isCheckedIn &&
          !!currentUserId &&
          item.userId !== currentUserId &&
          typeof onHighfive === 'function';
        const highfiveDisabled = hasHighfived || isPendingHighfive;
        const highfiveLabel = hasHighfived ? 'Highfivet' : 'Highfive';

        return (
          <View
            key={`${item.userId}-${item.status}`}
            style={[styles.row, isCompact ? styles.rowCompact : null]}
          >
            <View style={styles.identity}>
              <Avatar
                userId={item.userId}
                avatarUrl={item.avatarUrl}
                size={isCompact ? theme.spacing[8] : theme.spacing[10]}
                label={item.displayName || 'Fan'}
              />

              <Text
                variant={isCompact ? 'caption' : 'bodyBold'}
                color="primary"
                style={styles.name}
                numberOfLines={1}
              >
                {item.displayName || 'Fan'}
              </Text>
            </View>

            <View style={styles.trailing}>
              {canShowHighfive ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${highfiveLabel} ${item.displayName || 'fan'}`}
                  disabled={highfiveDisabled}
                  onPress={() => onHighfive?.(item.userId)}
                  style={({ pressed }) => [
                    styles.highfiveButton,
                    hasHighfived ? styles.highfiveButtonDone : null,
                    highfiveDisabled ? styles.highfiveButtonDisabled : null,
                    pressed && !highfiveDisabled ? styles.highfiveButtonPressed : null,
                  ]}
                >
                  <Text
                    variant="small"
                    style={[
                      styles.highfiveLabel,
                      hasHighfived ? styles.highfiveLabelDone : null,
                    ]}
                    numberOfLines={1}
                  >
                    {highfiveLabel}
                  </Text>
                </Pressable>
              ) : null}

              <View
                style={[
                  styles.statusPill,
                  isCheckedIn ? styles.statusPillCheckedIn : styles.statusPillGoing,
                ]}
              >
                {isCheckedIn ? (
                  <Ionicons
                    name="checkmark"
                    size={theme.components.icon.size.sm - 2}
                    color={theme.colors.text.inverse}
                  />
                ) : null}
                <Text
                  variant="small"
                  style={[
                    styles.statusLabel,
                    isCheckedIn ? styles.statusLabelCheckedIn : styles.statusLabelGoing,
                  ]}
                  numberOfLines={1}
                >
                  {isCheckedIn ? 'Tjekket ind' : 'Kommer'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {remainingCount > 0 ? (
        <Text variant="caption" color="secondary" style={styles.moreLabel}>
          +{remainingCount} flere
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      gap: theme.spacing[2],
    },
    containerCompact: {
      gap: theme.spacing[1] + theme.spacing[1] / 2,
    },
    row: {
      minHeight: theme.spacing[12],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
    },
    rowCompact: {
      minHeight: theme.spacing[10],
      paddingHorizontal: theme.spacing[2] + theme.spacing[1] / 2,
      paddingVertical: theme.spacing[1] + theme.spacing[1] / 2,
    },
    identity: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    name: {
      flex: 1,
      fontWeight: '700',
    },
    trailing: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: theme.spacing[2],
      flexShrink: 0,
    },
    highfiveButton: {
      minHeight: theme.spacing[7],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.bg.surface,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    highfiveButtonPressed: {
      opacity: 0.74,
      transform: [{ scale: 0.97 }],
    },
    highfiveButtonDone: {
      backgroundColor: theme.colors.bg.subtle,
      borderColor: theme.colors.border.default,
    },
    highfiveButtonDisabled: {
      opacity: 0.72,
    },
    highfiveLabel: {
      color: theme.colors.primary,
      fontWeight: '700',
    },
    highfiveLabelDone: {
      color: theme.colors.text.secondary,
    },
    statusPill: {
      minHeight: theme.spacing[7],
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[1] / 2,
      flexShrink: 0,
    },
    statusPillCheckedIn: {
      backgroundColor: theme.colors.state.success,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.state.success,
    },
    statusPillGoing: {
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    statusLabel: {
      fontWeight: '700',
    },
    statusLabelCheckedIn: {
      color: theme.colors.text.inverse,
    },
    statusLabelGoing: {
      color: theme.colors.pill.neutral.text,
    },
    moreLabel: {
      marginTop: theme.spacing[1] / 2,
      fontWeight: '600',
    },
    emptyWrap: {
      paddingVertical: theme.spacing[1],
    },
    emptyText: {
      fontWeight: '600',
    },
  });
