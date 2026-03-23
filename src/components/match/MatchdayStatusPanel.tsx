import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { getShadowStyle, useTheme } from '../../theme';
import type { MatchViewState } from '../../utils/matchdayState';
import { Text } from '../ui';

export type MatchdayStatusPanelState =
  | 'pre_match'
  | 'pre_match_confirmed'
  | 'matchday_action'
  | 'checked_in_confirmed';

export interface MatchdayStatusPanelAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}

interface MatchdayStatusPanelProps {
  viewState: MatchViewState;
  isGoing: boolean;
  avatars: string[];
  count: number;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPressPrimary: () => void;
  onPressSocial?: () => void;
  secondaryActions?: MatchdayStatusPanelAction[];
  style?: StyleProp<ViewStyle>;
}

function getPanelState(viewState: MatchViewState, isGoing: boolean): MatchdayStatusPanelState {
  if (viewState === 'checked_in_confirmed') return 'checked_in_confirmed';
  if (viewState === 'matchday_action') return 'matchday_action';
  return isGoing ? 'pre_match_confirmed' : 'pre_match';
}

function getTitle(panelState: MatchdayStatusPanelState): string {
  switch (panelState) {
    case 'pre_match_confirmed':
      return 'Du kommer';
    case 'matchday_action':
      return 'Er du på stadion?';
    case 'checked_in_confirmed':
      return 'Du er tjekket ind!';
    case 'pre_match':
    default:
      return 'Kommer du?';
  }
}

function getDefaultPrimaryLabel(panelState: MatchdayStatusPanelState): string {
  switch (panelState) {
    case 'pre_match_confirmed':
      return 'Du kommer';
    case 'matchday_action':
      return 'Tjek ind';
    case 'pre_match':
    default:
      return 'Jeg kommer';
  }
}

function getResolvedTitle(panelState: MatchdayStatusPanelState, isGoing: boolean): string {
  if (panelState === 'matchday_action') {
    return isGoing ? 'Klar til at tjekke ind?' : 'Er du på stadion?';
  }

  return getTitle(panelState);
}

function getSocialCopy(panelState: MatchdayStatusPanelState, count: number) {
  if (count <= 0) {
    switch (panelState) {
      case 'matchday_action':
        return { countLabel: null, text: 'Ingen fans har tjekket ind endnu' };
      case 'checked_in_confirmed':
        return { countLabel: null, text: 'Du er den første fan på stadion' };
      case 'pre_match_confirmed':
      case 'pre_match':
      default:
        return { countLabel: null, text: 'Ingen fans har meldt sig endnu' };
    }
  }

  const formattedCount = count.toLocaleString('da-DK');
  const countLabel = count > 1 ? `+${formattedCount}` : formattedCount;
  const fanLabel = count === 1 ? 'fan' : 'fans';

  switch (panelState) {
    case 'matchday_action':
      return { countLabel, text: `${fanLabel} har tjekket ind` };
    case 'checked_in_confirmed':
      return { countLabel, text: `${fanLabel} er her med dig` };
    case 'pre_match_confirmed':
    case 'pre_match':
    default:
      return { countLabel, text: `${fanLabel} kommer` };
  }
}

function getPrimaryIcon(panelState: MatchdayStatusPanelState): keyof typeof Ionicons.glyphMap {
  switch (panelState) {
    case 'pre_match_confirmed':
      return 'checkmark-circle';
    case 'matchday_action':
      return 'location';
    case 'pre_match':
    default:
      return 'person-add';
  }
}

export function MatchdayStatusPanel({
  viewState,
  isGoing,
  avatars,
  count,
  primaryLabel,
  primaryDisabled,
  onPressPrimary,
  onPressSocial,
  secondaryActions = [],
  style,
}: MatchdayStatusPanelProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const panelState = getPanelState(viewState, isGoing);
  const visibleAvatars = avatars.slice(0, 3);
  const socialCopy = getSocialCopy(panelState, count);
  const hasPrimaryAction = panelState !== 'checked_in_confirmed';
  const resolvedPrimaryLabel = primaryLabel ?? getDefaultPrimaryLabel(panelState);
  const defaultPrimaryDisabled =
    panelState === 'pre_match_confirmed' || panelState === 'checked_in_confirmed';
  const resolvedPrimaryDisabled = primaryDisabled ?? defaultPrimaryDisabled;
  const primaryIsAccent = panelState === 'pre_match' || panelState === 'matchday_action';
  const primaryIconColor = primaryIsAccent ? theme.colors.text.inverse : theme.colors.info;
  const socialContent = (
    <View
      style={[
        styles.socialRow,
        panelState === 'checked_in_confirmed' ? styles.socialRowCheckedIn : null,
      ]}
    >
      {visibleAvatars.length > 0 ? (
        <View style={styles.avatarStack}>
          {visibleAvatars.map((avatarUrl, index) => (
            <Image
              key={`${avatarUrl}-${index}`}
              source={{ uri: avatarUrl }}
              style={[styles.avatarBubble, index > 0 ? styles.avatarOverlap : null]}
            />
          ))}
        </View>
      ) : (
        <View style={styles.socialIconWrap}>
          <Ionicons
            name={panelState === 'checked_in_confirmed' ? 'people' : 'people-outline'}
            size={16}
            color={theme.colors.info}
          />
        </View>
      )}

      {socialCopy.countLabel ? (
        <View
          style={[
            styles.countPill,
            panelState === 'checked_in_confirmed' ? styles.countPillCheckedIn : null,
          ]}
        >
          <Text
            variant="small"
            style={[
              styles.countPillText,
              panelState === 'checked_in_confirmed' ? styles.countPillTextCheckedIn : null,
            ]}
          >
            {socialCopy.countLabel}
          </Text>
        </View>
      ) : null}

      <Text variant="bodyBold" color="primary" style={styles.socialText} numberOfLines={2}>
        {socialCopy.text}
      </Text>

      {onPressSocial ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.colors.info}
          style={styles.socialChevron}
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.panel, getShadowStyle(theme, 'md'), style]}>
      <View
        style={[
          styles.panelGlow,
          panelState === 'checked_in_confirmed' ? styles.panelGlowCheckedIn : null,
        ]}
      />

      <View style={styles.headerBlock}>
        <View style={styles.titleRow}>
          {panelState === 'checked_in_confirmed' ? (
            <View style={styles.confirmBadge}>
              <Ionicons name="checkmark" size={16} color={theme.colors.text.inverse} />
            </View>
          ) : null}
          <Text variant="h3" color="primary" style={styles.title} numberOfLines={2}>
            {getResolvedTitle(panelState, isGoing)}
          </Text>
        </View>
      </View>

      {onPressSocial ? (
        <Pressable
          onPress={onPressSocial}
          style={({ pressed }) => [styles.socialPressable, pressed ? styles.pressed : null]}
        >
          {socialContent}
        </Pressable>
      ) : (
        socialContent
      )}

      {hasPrimaryAction ? (
        <Pressable
          onPress={onPressPrimary}
          disabled={resolvedPrimaryDisabled}
          style={({ pressed }) => [
            styles.primaryButton,
            primaryIsAccent ? styles.primaryButtonAccent : styles.primaryButtonConfirmed,
            resolvedPrimaryDisabled && primaryIsAccent ? styles.primaryButtonBusy : null,
            pressed && !resolvedPrimaryDisabled ? styles.pressed : null,
          ]}
        >
          <Ionicons
            name={getPrimaryIcon(panelState)}
            size={18}
            color={primaryIconColor}
          />
          <Text
            variant="bodyBold"
            style={[
              styles.primaryText,
              primaryIsAccent ? styles.primaryTextAccent : styles.primaryTextConfirmed,
            ]}
            numberOfLines={1}
          >
            {resolvedPrimaryLabel}
          </Text>
        </Pressable>
      ) : null}

      {secondaryActions.length > 0 ? (
        <View style={styles.secondaryRow}>
          {secondaryActions.slice(0, 2).map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              disabled={action.disabled}
              style={({ pressed }) => [
                styles.secondaryButton,
                action.disabled ? styles.secondaryButtonDisabled : null,
                pressed && !action.disabled ? styles.pressed : null,
              ]}
            >
              <Ionicons
                name={action.icon}
                size={16}
                color={action.disabled ? theme.colors.text.muted : theme.colors.info}
              />
              <Text
                variant="caption"
                color={action.disabled ? 'muted' : 'primary'}
                style={[
                  styles.secondaryLabel,
                  action.disabled ? styles.secondaryLabelDisabled : null,
                ]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    panel: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      padding: theme.layout.cardPadding + 2,
      gap: 9,
    },
    panelGlow: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.info,
      opacity: theme.mode === 'light' ? 0.08 : 0.12,
    },
    panelGlowCheckedIn: {
      opacity: theme.mode === 'light' ? 0.12 : 0.16,
    },
    headerBlock: {
      gap: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2] + theme.spacing[1] / 2,
      minHeight: 30,
    },
    confirmBadge: {
      width: 30,
      height: 30,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.info,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.pill.green.border,
    },
    title: {
      flex: 1,
      fontWeight: '800',
      lineHeight: 27,
      letterSpacing: -0.2,
    },
    socialPressable: {
      width: '100%',
    },
    socialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2] + theme.spacing[1] / 2,
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    socialRowCheckedIn: {
      backgroundColor: theme.colors.bg.surface,
      borderColor: theme.colors.info,
    },
    avatarStack: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
    },
    avatarBubble: {
      width: 28,
      height: 28,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderColor: theme.colors.bg.surface,
      backgroundColor: theme.colors.bg.subtle,
    },
    avatarOverlap: {
      marginLeft: -(theme.spacing[2] + theme.spacing[1] / 2),
    },
    socialIconWrap: {
      width: 28,
      height: 28,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
    },
    countPill: {
      minHeight: 28,
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    countPillCheckedIn: {
      borderColor: theme.colors.info,
    },
    countPillText: {
      color: theme.colors.info,
      fontWeight: '700',
    },
    countPillTextCheckedIn: {
      color: theme.colors.info,
    },
    socialText: {
      flex: 1,
      lineHeight: 21,
      fontWeight: '600',
    },
    socialChevron: {
      marginLeft: theme.spacing[1],
    },
    primaryButton: {
      minHeight: theme.components.button.size.lg.height,
      borderRadius: theme.components.button.radius,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[2],
      paddingHorizontal: theme.components.button.size.lg.px,
      paddingVertical: theme.spacing[3],
    },
    primaryButtonAccent: {
      backgroundColor: theme.colors.info,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
    },
    primaryButtonConfirmed: {
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
    },
    primaryButtonBusy: {
      opacity: 0.8,
    },
    primaryText: {
      fontWeight: '700',
    },
    primaryTextAccent: {
      color: theme.colors.text.inverse,
    },
    primaryTextConfirmed: {
      color: theme.colors.info,
    },
    secondaryRow: {
      flexDirection: 'row',
      gap: 9,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.bg.card,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: theme.spacing[1],
    },
    secondaryButtonDisabled: {
      backgroundColor: theme.colors.bg.subtle,
      borderColor: theme.colors.border.light,
    },
    secondaryLabel: {
      fontWeight: '700',
      color: theme.colors.info,
    },
    secondaryLabelDisabled: {
      color: theme.colors.text.muted,
    },
    pressed: {
      opacity: 0.9,
    },
  });
