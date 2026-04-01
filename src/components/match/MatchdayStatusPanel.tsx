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
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  secondarySelected?: boolean;
  secondaryActions?: MatchdayStatusPanelAction[];
  simpleParticipationModel?: boolean;
  onPressPrimary: () => void;
  onPressSecondary?: () => void;
  onPressSocial?: () => void;
  style?: StyleProp<ViewStyle>;
}

function getPanelState(viewState: MatchViewState, isGoing: boolean): MatchdayStatusPanelState {
  if (viewState === 'checked_in_confirmed') return 'checked_in_confirmed';
  if (viewState === 'matchday_action') return 'matchday_action';
  return isGoing ? 'pre_match_confirmed' : 'pre_match';
}

function getResolvedTitle(
  panelState: MatchdayStatusPanelState,
  isGoing: boolean,
  simpleParticipationModel: boolean,
): string {
  if (!simpleParticipationModel) {
    switch (panelState) {
      case 'pre_match_confirmed':
        return 'Du kommer';
      case 'matchday_action':
        return isGoing ? 'Klar til at tjekke ind?' : 'Er du pa stadion?';
      case 'checked_in_confirmed':
        return 'Du er tjekket ind';
      case 'pre_match':
      default:
        return 'Kommer du?';
    }
  }

  switch (panelState) {
    case 'matchday_action':
      return 'Check-in';
    case 'checked_in_confirmed':
      return 'Check-in';
    case 'pre_match_confirmed':
    case 'pre_match':
    default:
      return 'Deltagelse';
  }
}

function getDefaultPrimaryLabel(
  panelState: MatchdayStatusPanelState,
  simpleParticipationModel: boolean,
): string {
  if (!simpleParticipationModel) {
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

  switch (panelState) {
    case 'matchday_action':
      return 'Tjek ind';
    case 'pre_match_confirmed':
      return 'Du kommer';
    case 'pre_match':
    default:
      return 'Jeg kommer';
  }
}

function getSocialCopy(
  panelState: MatchdayStatusPanelState,
  count: number,
  simpleParticipationModel: boolean,
) {
  if (!simpleParticipationModel) {
    if (count <= 0) {
      switch (panelState) {
        case 'matchday_action':
          return { countLabel: null, text: 'Ingen fans har tjekket ind endnu' };
        case 'checked_in_confirmed':
          return { countLabel: null, text: 'Du er den forste fan pa stadion' };
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

  if (count <= 0) {
    switch (panelState) {
      case 'matchday_action':
        return { countLabel: null, text: 'Ingen fans har tjekket ind endnu' };
      case 'checked_in_confirmed':
        return { countLabel: null, text: 'Du er den forste fan pa stadion' };
      case 'pre_match_confirmed':
      case 'pre_match':
      default:
        return { countLabel: null, text: 'Ingen fans kommer endnu' };
    }
  }

  const formattedCount = count.toLocaleString('da-DK');

  switch (panelState) {
    case 'matchday_action':
      return { countLabel: formattedCount, text: 'har tjekket ind' };
    case 'checked_in_confirmed':
      return { countLabel: formattedCount, text: 'er her med dig' };
    case 'pre_match_confirmed':
    case 'pre_match':
    default:
      return { countLabel: formattedCount, text: count === 1 ? 'fan kommer' : 'fans kommer' };
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

function getSimpleStatusText(
  panelState: MatchdayStatusPanelState,
  isGoing: boolean,
  isDeclined: boolean,
): string {
  switch (panelState) {
    case 'matchday_action':
      return isGoing ? 'Er du på stadion? Tjek ind nu.' : 'Er du på stadion? Tjek ind her.';
    case 'checked_in_confirmed':
      return 'Du er tjekket ind på stadion.';
    case 'pre_match_confirmed':
      return 'Du kommer til kampen.';
    case 'pre_match':
    default:
      return isDeclined ? 'Du deltager ikke i kampen.' : 'Vælg om du kommer.';
  }
}

export function MatchdayStatusPanel({
  viewState,
  isGoing,
  avatars,
  count,
  primaryLabel,
  primaryDisabled,
  secondaryLabel,
  secondaryDisabled,
  secondarySelected = false,
  secondaryActions = [],
  simpleParticipationModel = false,
  onPressPrimary,
  onPressSecondary,
  onPressSocial,
  style,
}: MatchdayStatusPanelProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const panelState = getPanelState(viewState, isGoing);
  const visibleAvatars = avatars.slice(0, 3);
  const socialCopy = getSocialCopy(panelState, count, simpleParticipationModel);
  const hasPrimaryAction = panelState !== 'checked_in_confirmed';
  const resolvedPrimaryLabel =
    primaryLabel ?? getDefaultPrimaryLabel(panelState, simpleParticipationModel);
  const resolvedPrimaryDisabled =
    primaryDisabled ??
    (simpleParticipationModel
      ? false
      : panelState === 'pre_match_confirmed' || panelState === 'checked_in_confirmed');
  const resolvedSecondaryDisabled = secondaryDisabled ?? false;
  const primaryIsAccent = panelState === 'pre_match' || panelState === 'matchday_action';
  const primaryIconColor = primaryIsAccent ? theme.colors.text.inverse : theme.colors.info;
  const legacySecondaryActions = secondaryActions.slice(0, 2);

  const isSimplePreMatch =
    simpleParticipationModel &&
    (panelState === 'pre_match' || panelState === 'pre_match_confirmed');
  const isSimpleCheckIn = simpleParticipationModel && panelState === 'matchday_action';
  const isSimpleCheckedIn = simpleParticipationModel && panelState === 'checked_in_confirmed';
  const isSimpleDeclined = simpleParticipationModel && panelState === 'pre_match' && secondarySelected;
  const isSimpleAttending = simpleParticipationModel && panelState === 'pre_match_confirmed';
  const isSimpleNeutral = isSimplePreMatch && !isSimpleAttending && !isSimpleDeclined;
  const displayedSimpleStatusText = isSimpleCheckIn
    ? 'Er du på stadion?'
    : isSimpleCheckedIn
      ? 'Du er tjekket ind.'
      : isSimpleAttending
        ? 'Du kommer.'
        : isSimpleDeclined
          ? 'Kan ikke komme.'
          : 'Kommer du?';

  const simplePrimaryAction =
    !simpleParticipationModel || !hasPrimaryAction
      ? null
      : isSimpleCheckIn
        ? {
            label: resolvedPrimaryLabel,
            icon: getPrimaryIcon(panelState),
            onPress: onPressPrimary,
            disabled: resolvedPrimaryDisabled,
          }
        : isSimpleDeclined
          ? {
              label: 'Jeg kommer',
              icon: 'person-add' as const,
              onPress: onPressPrimary,
              disabled: resolvedPrimaryDisabled,
            }
          : isSimpleAttending
            ? {
                label: 'Du kommer',
                icon: 'checkmark' as const,
                onPress: onPressPrimary,
                disabled: resolvedPrimaryDisabled,
              }
            : {
                label: resolvedPrimaryLabel,
                icon: getPrimaryIcon(panelState),
                onPress: onPressPrimary,
                disabled: resolvedPrimaryDisabled,
              };

  const simpleSecondaryAction =
    !simpleParticipationModel ||
    !secondaryLabel ||
    !onPressSecondary ||
    isSimpleCheckIn ||
    isSimpleCheckedIn ||
    isSimpleDeclined
      ? null
      : {
          label: isSimpleNeutral ? 'Kan ikke' : secondaryLabel,
          onPress: onPressSecondary,
          disabled: resolvedSecondaryDisabled,
        };

  const socialContent = (
    <View
      style={[
        styles.socialRow,
        simpleParticipationModel ? styles.socialRowSimple : null,
        panelState === 'checked_in_confirmed' ? styles.socialRowCheckedIn : null,
      ]}
    >
      {visibleAvatars.length > 0 ? (
        <View style={styles.avatarStack}>
          {visibleAvatars.map((avatarUrl, index) => (
            <Image
              key={`${avatarUrl}-${index}`}
              source={{ uri: avatarUrl }}
              style={[
                styles.avatarBubble,
                simpleParticipationModel ? styles.avatarBubbleSimple : null,
                index > 0 ? styles.avatarOverlap : null,
              ]}
            />
          ))}
        </View>
      ) : (
        <View
          style={[
            styles.socialIconWrap,
            simpleParticipationModel ? styles.socialIconWrapSimple : null,
          ]}
        >
          <Ionicons
            name={panelState === 'checked_in_confirmed' ? 'people' : 'people-outline'}
            size={theme.components.icon.size.sm}
            color={theme.colors.info}
          />
        </View>
      )}

      {socialCopy.countLabel ? (
        <View
          style={[
            styles.countPill,
            simpleParticipationModel ? styles.countPillSimple : null,
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

      <Text
        variant="bodyBold"
        color="primary"
        style={[styles.socialText, simpleParticipationModel ? styles.socialTextSimple : null]}
        numberOfLines={2}
      >
        {socialCopy.text}
      </Text>

      {onPressSocial ? (
        <Ionicons
          name="chevron-forward"
          size={theme.components.icon.size.sm}
          color={simpleParticipationModel ? theme.colors.text.secondary : theme.colors.info}
          style={styles.socialChevron}
        />
      ) : null}
    </View>
  );

  if (simpleParticipationModel) {
    return (
      <View
        style={[
          styles.panel,
          styles.panelSimple,
          panelState === 'checked_in_confirmed' ? styles.panelSimpleCheckedIn : null,
          getShadowStyle(theme, 'md'),
          style,
        ]}
      >
        {onPressSocial ? (
          <Pressable
            onPress={onPressSocial}
            style={({ pressed }) => [
              styles.socialPressable,
              styles.socialPressableSimple,
              pressed ? styles.pressed : null,
            ]}
          >
            {socialContent}
          </Pressable>
        ) : (
          socialContent
        )}

        <View style={styles.simpleStatusBlock}>
          <Text variant="body" color="secondary" style={styles.simpleStatusText}>
            {displayedSimpleStatusText}
          </Text>
        </View>

        {isSimpleDeclined || hasPrimaryAction ? (
          <View style={styles.simpleDecisionGroup}>
            {isSimpleDeclined ? (
              <View style={styles.simpleSelectedStateChip}>
                <Ionicons
                  name="close-circle"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.text.secondary}
                />
                <Text variant="small" color="secondary" style={styles.simpleSelectedStateText}>
                  Kan ikke komme
                </Text>
              </View>
            ) : null}

            {hasPrimaryAction ? (
              <View
                style={[
                  styles.actionRow,
                  styles.actionRowSimple,
                  isSimpleNeutral ? styles.actionRowSimpleSplit : null,
                ]}
              >
                {simplePrimaryAction ? (
                  <Pressable
                    onPress={simplePrimaryAction.onPress}
                    disabled={simplePrimaryAction.disabled}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      isSimpleNeutral ? styles.primaryButtonSimpleSplit : styles.primaryButtonSimple,
                      styles.primaryButtonSimpleBrand,
                      simplePrimaryAction.disabled ? styles.primaryButtonBusy : null,
                      pressed && !simplePrimaryAction.disabled ? styles.pressed : null,
                    ]}
                  >
                    <Ionicons
                      name={simplePrimaryAction.icon}
                      size={theme.components.icon.size.sm}
                      color={theme.colors.text.inverse}
                    />
                    <Text
                      variant="bodyBold"
                      style={[styles.primaryText, styles.primaryTextSimple, styles.primaryTextAccent]}
                      numberOfLines={1}
                    >
                      {simplePrimaryAction.label}
                    </Text>
                  </Pressable>
                ) : null}

                {simpleSecondaryAction ? (
                  <Pressable
                    onPress={simpleSecondaryAction.onPress}
                    disabled={simpleSecondaryAction.disabled}
                    style={({ pressed }) => [
                      styles.secondaryChoiceButton,
                      isSimpleNeutral
                        ? styles.secondaryChoiceButtonSimpleSplit
                        : styles.secondaryChoiceButtonSimple,
                      simpleSecondaryAction.disabled ? styles.secondaryButtonDisabled : null,
                      pressed && !simpleSecondaryAction.disabled ? styles.pressed : null,
                    ]}
                  >
                    <Text
                      variant="bodyBold"
                      style={[
                        styles.secondaryChoiceText,
                        styles.secondaryChoiceTextSimple,
                        simpleSecondaryAction.disabled ? styles.secondaryLabelDisabled : null,
                      ]}
                      numberOfLines={1}
                    >
                      {simpleSecondaryAction.label}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

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
              <Ionicons
                name="checkmark"
                size={theme.components.icon.size.sm}
                color={theme.colors.text.inverse}
              />
            </View>
          ) : null}
          <Text variant="h3" color="primary" style={styles.title} numberOfLines={2}>
            {getResolvedTitle(panelState, isGoing, false)}
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
            primaryIsAccent ? styles.primaryButtonAccent : styles.primaryButtonNeutral,
            resolvedPrimaryDisabled ? styles.primaryButtonBusy : null,
            pressed && !resolvedPrimaryDisabled ? styles.pressed : null,
          ]}
        >
          <Ionicons
            name={getPrimaryIcon(panelState)}
            size={theme.components.icon.size.sm}
            color={primaryIconColor}
          />
          <Text
            variant="bodyBold"
            style={[
              styles.primaryText,
              primaryIsAccent ? styles.primaryTextAccent : styles.primaryTextNeutral,
            ]}
            numberOfLines={1}
          >
            {resolvedPrimaryLabel}
          </Text>
        </Pressable>
      ) : null}

      {legacySecondaryActions.length > 0 ? (
        <View style={styles.legacySecondaryRow}>
          {legacySecondaryActions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              disabled={action.disabled}
              style={({ pressed }) => [
                styles.legacySecondaryButton,
                action.disabled ? styles.secondaryButtonDisabled : null,
                pressed && !action.disabled ? styles.pressed : null,
              ]}
            >
              <Ionicons
                name={action.icon}
                size={theme.components.icon.size.sm}
                color={action.disabled ? theme.colors.text.muted : theme.colors.info}
              />
              <Text
                variant="caption"
                color={action.disabled ? 'muted' : 'primary'}
                style={[
                  styles.legacySecondaryLabel,
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
      padding: theme.layout.cardPadding,
      gap: theme.spacing[1] + theme.spacing[1] / 2,
    },
    panelSimple: {
      borderRadius: theme.radius.xl,
      borderColor: theme.colors.border.default,
      padding: theme.layout.cardPadding,
      gap: theme.spacing[1] + theme.spacing[1] / 2,
    },
    panelSimpleCheckedIn: {
      borderColor: theme.colors.info,
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
      gap: theme.spacing[0],
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      minHeight: theme.spacing[7],
    },
    confirmBadge: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.info,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.pill.green.border,
    },
    title: {
      flex: 1,
      fontWeight: '700',
      lineHeight: theme.typography.h3.lineHeight - 1,
    },
    socialPressable: {
      width: '100%',
    },
    socialPressableSimple: {
      width: '100%',
    },
    socialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1] + theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      paddingVertical: theme.spacing[1],
      backgroundColor: 'transparent',
    },
    socialRowCheckedIn: {
      backgroundColor: 'transparent',
    },
    socialRowSimple: {
      gap: theme.spacing[2],
      paddingVertical: theme.spacing[1],
    },
    avatarStack: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
    },
    avatarBubble: {
      width: theme.spacing[7],
      height: theme.spacing[7],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.bg.surface,
      backgroundColor: theme.colors.bg.subtle,
    },
    avatarBubbleSimple: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderColor: theme.colors.bg.surface,
    },
    avatarOverlap: {
      marginLeft: -(theme.spacing[2] + theme.spacing[1] / 2),
    },
    socialIconWrap: {
      width: theme.spacing[7],
      height: theme.spacing[7],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: 0,
    },
    socialIconWrapSimple: {
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.surface,
    },
    countPill: {
      minHeight: theme.spacing[6],
      paddingHorizontal: theme.spacing[1] + theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
    },
    countPillSimple: {
      minHeight: theme.spacing[6],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.subtle,
      paddingHorizontal: theme.spacing[2],
    },
    countPillCheckedIn: {
      backgroundColor: theme.colors.bg.subtle,
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
      lineHeight: theme.spacing[4] + theme.spacing[1] / 2,
      fontWeight: '600',
    },
    socialTextSimple: {
      fontWeight: '600',
      lineHeight: theme.typography.body.lineHeight,
    },
    socialChevron: {
      marginLeft: theme.spacing[1] / 2,
    },
    simpleStatusBlock: {
      gap: theme.spacing[0],
    },
    simpleStatusText: {
      lineHeight: theme.typography.body.lineHeight,
      fontWeight: '500',
    },
    simpleDecisionGroup: {
      gap: theme.spacing[1],
      alignItems: 'stretch',
    },
    simpleSelectedStateChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1] / 2,
      minHeight: theme.spacing[6],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    simpleSelectedStateText: {
      fontWeight: '600',
    },
    actionRow: {
      gap: theme.spacing[1] + theme.spacing[1] / 2,
    },
    actionRowSimple: {
      gap: theme.spacing[1],
    },
    actionRowSimpleSplit: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    primaryButton: {
      minHeight: theme.spacing[11],
      borderRadius: theme.radius.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
    },
    primaryButtonSimple: {
      minHeight: theme.spacing[10],
      borderRadius: theme.radius.lg,
      width: '100%',
    },
    primaryButtonSimpleSplit: {
      flex: 1,
      minHeight: theme.spacing[10],
      borderRadius: theme.radius.lg,
    },
    primaryButtonSimpleBrand: {
      backgroundColor: theme.colors.info,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
    },
    primaryButtonAccent: {
      backgroundColor: theme.colors.info,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
    },
    primaryButtonNeutral: {
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
    },
    primaryButtonBusy: {
      opacity: 0.8,
    },
    primaryText: {
      fontWeight: '600',
    },
    primaryTextSimple: {
      fontWeight: '700',
      fontSize: theme.typography.body.fontSize - 1,
    },
    primaryTextAccent: {
      color: theme.colors.text.inverse,
    },
    primaryTextNeutral: {
      color: theme.colors.info,
    },
    secondaryChoiceButton: {
      minHeight: theme.spacing[11],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: theme.spacing[1],
    },
    secondaryChoiceButtonSimple: {
      alignSelf: 'stretch',
      minHeight: theme.spacing[8],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
    },
    secondaryChoiceButtonSimpleSplit: {
      flex: 1,
      minHeight: theme.spacing[10],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonDisabled: {
      backgroundColor: theme.colors.bg.subtle,
      borderColor: theme.colors.border.light,
    },
    secondaryChoiceText: {
      fontWeight: '600',
      color: theme.colors.text.secondary,
    },
    secondaryChoiceTextSimple: {
      fontWeight: '600',
      fontSize: theme.typography.body.fontSize - 1,
      color: theme.colors.text.secondary,
    },
    legacySecondaryRow: {
      flexDirection: 'row',
      gap: theme.spacing[1] + theme.spacing[1] / 2,
    },
    legacySecondaryButton: {
      flex: 1,
      minHeight: theme.spacing[11],
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
    legacySecondaryLabel: {
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
