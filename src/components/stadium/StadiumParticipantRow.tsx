import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import type { StadiumParticipant, StadiumReactionType } from '../../types/stadiumLive';
import { getStadiumReactionOption } from '../../utils/stadiumLive';
import { OptionsMenu } from '../OptionsMenu';
import { Avatar } from '../Avatar';
import { Text } from '../ui';
import { StadiumReactionPicker } from './StadiumReactionPicker';

type Props = {
  participant: StadiumParticipant;
  pending?: boolean;
  sentReactionType?: StadiumReactionType | null;
  cooldownSeconds?: number;
  onProfile: () => void;
  onMessage: () => void;
  onReport: () => void;
  onReact: (reactionType: StadiumReactionType) => void;
};

export function StadiumParticipantRow({
  participant,
  pending,
  sentReactionType,
  cooldownSeconds = 0,
  onProfile,
  onMessage,
  onReport,
  onReact,
}: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [pickerVisible, setPickerVisible] = useState(false);
  const displayName = participant.displayName || participant.username || 'FCN-fan';
  const disabled = pending || !participant.canReact || cooldownSeconds > 0;
  const sentOption = sentReactionType ? getStadiumReactionOption(sentReactionType) : null;
  const reactionAccessibilityLabel = pending
    ? `Sender reaktion til ${displayName}`
    : sentOption
      ? `${sentOption.label} sendt til ${displayName}`
      : cooldownSeconds > 0
        ? `Vent ${cooldownSeconds} sekunder før en ny reaktion til ${displayName}`
        : participant.canReact
          ? `Send high five til ${displayName}`
          : `Reaktioner er ikke tilgængelige for ${displayName}`;

  const handleSelect = (reactionType: StadiumReactionType) => {
    setPickerVisible(false);
    onReact(reactionType);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Se profil for ${displayName}`}
        onPress={onProfile}
        style={({ pressed }) => [styles.identity, pressed ? styles.pressed : null]}
      >
        <Avatar
          userId={participant.userId}
          avatarUrl={participant.avatarUrl}
          label={displayName}
          size={theme.spacing[11]}
        />
        <View style={styles.copy}>
          <Text variant="bodyBold" numberOfLines={1}>
            {displayName}
          </Text>
          {participant.username ? (
            <Text variant="small" color="secondary" numberOfLines={1}>
              @{participant.username}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {participant.sameCommunity ? (
              <View style={styles.affinityBadge}>
                <Ionicons name="people" size={12} color={theme.colors.primary} />
                <Text variant="small" style={styles.affinityText}>
                  Samme fællesskab
                </Text>
              </View>
            ) : null}
            {participant.sectionLabel ? (
              <Text variant="small" color="secondary" numberOfLines={1}>
                {participant.sectionLabel}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reactionAccessibilityLabel}
          accessibilityHint={disabled ? undefined : 'Hold inde for at vælge en anden reaktion'}
          accessibilityState={{ disabled, busy: pending === true }}
          disabled={disabled}
          onPress={() => onReact('high_five')}
          onLongPress={() => !disabled && setPickerVisible(true)}
          delayLongPress={300}
          style={({ pressed }) => [
            styles.reactionButton,
            sentOption ? styles.reactionButtonSent : null,
            pressed && !disabled ? styles.reactionButtonPressed : null,
            disabled ? styles.disabled : null,
          ]}
        >
          <Text style={styles.reactionEmoji}>
            {pending ? '…' : sentOption ? sentOption.emoji : '🙌'}
          </Text>
          {sentOption ? (
            <Text
              variant="small"
              color="success"
              numberOfLines={1}
              maxFontSizeMultiplier={1.25}
              accessibilityLiveRegion="polite"
            >
              Sendt
            </Text>
          ) : cooldownSeconds > 0 ? (
            <Text variant="small" color="secondary">
              {cooldownSeconds}s
            </Text>
          ) : null}
        </Pressable>
        <OptionsMenu
          options={[
            {
              label: 'Vælg reaktion',
              icon: 'happy-outline',
              onPress: () => setPickerVisible(true),
            },
            ...(participant.canMessage
              ? [{ label: 'Send besked', icon: 'chatbubble-outline' as const, onPress: onMessage }]
              : []),
            { label: 'Se profil', icon: 'person-outline', onPress: onProfile },
            {
              label: 'Rapportér bruger',
              icon: 'flag-outline',
              destructive: true,
              onPress: onReport,
            },
          ]}
        />
      </View>

      <StadiumReactionPicker
        visible={pickerVisible}
        disabled={disabled}
        onClose={() => setPickerVisible(false)}
        onSelect={handleSelect}
      />
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    row: {
      minHeight: theme.spacing[16],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[3],
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.surface,
    },
    identity: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
    },
    copy: { flex: 1, minWidth: 0, gap: theme.spacing[0] },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing[1],
      marginTop: theme.spacing[1],
    },
    affinityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
    },
    affinityText: { color: theme.colors.primary, fontWeight: '700' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
    reactionButton: {
      minWidth: theme.spacing[12],
      minHeight: theme.spacing[12],
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[1],
      paddingVertical: theme.spacing[1] / 2,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.primary,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.surface,
    },
    reactionEmoji: { fontSize: theme.spacing[6] },
    reactionButtonSent: {
      borderColor: theme.colors.state.success,
      backgroundColor: theme.colors.bg.subtle,
    },
    reactionButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.42 },
  });
