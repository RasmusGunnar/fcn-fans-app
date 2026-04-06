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

export type MatchdaySimpleParticipationMode =
  | 'rsvp'
  | 'not_going_matchday'
  | 'check_in'
  | 'checked_in';

export interface MatchdayStatusPanelAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}

interface MatchdayStatusPanelSocialCopy {
  countLabel?: string | null;
  text: string;
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
  simpleParticipationModeType?: MatchdaySimpleParticipationMode;
  titleOverride?: string;
  bodyOverride?: string;
  socialCopyOverride?: MatchdayStatusPanelSocialCopy;
  rewardLabelOverride?: string;
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
        return isGoing ? 'Klar til at tjekke ind?' : 'Er du på stadion?';
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
          return { countLabel: null, text: 'Vær den første fan på stadion' };
        case 'checked_in_confirmed':
          return { countLabel: null, text: 'Du er blandt de første på stadion' };
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
        return { countLabel, text: `${fanLabel} er på stadion` };
      case 'checked_in_confirmed':
        return { countLabel, text: `${fanLabel} er her nu` };
      case 'pre_match_confirmed':
      case 'pre_match':
      default:
        return { countLabel, text: `${fanLabel} kommer` };
    }
  }

  if (count <= 0) {
    switch (panelState) {
      case 'matchday_action':
        return { countLabel: null, text: 'Vær den første fan på stadion' };
      case 'checked_in_confirmed':
        return { countLabel: null, text: 'Du er klar til kampdag' };
      case 'pre_match_confirmed':
      case 'pre_match':
      default:
        return { countLabel: null, text: 'Vær den første fan, der melder sig klar' };
    }
  }

  const formattedCount = count.toLocaleString('da-DK');

  switch (panelState) {
    case 'matchday_action':
      return { countLabel: formattedCount, text: 'er på stadion nu' };
    case 'checked_in_confirmed':
      return { countLabel: formattedCount, text: 'er her med dig' };
    case 'pre_match_confirmed':
    case 'pre_match':
    default:
      return {
        countLabel: formattedCount,
        text: count === 1 ? 'fan er med 🔥' : 'fans er med 🔥',
      };
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
  simpleParticipationModeType,
  titleOverride,
  bodyOverride,
  socialCopyOverride,
  rewardLabelOverride,
  onPressPrimary,
  onPressSecondary,
  onPressSocial,
  style,
}: MatchdayStatusPanelProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const panelState = getPanelState(viewState, isGoing);
  const visibleAvatars = avatars.slice(0, 3);
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
  const isCompactMatchday = !simpleParticipationModel && panelState === 'matchday_action';
  const isCompactCheckedIn = !simpleParticipationModel && panelState === 'checked_in_confirmed';
  const resolvedTitle = titleOverride ?? getResolvedTitle(panelState, isGoing, simpleParticipationModel);
  const resolvedSimpleMode: MatchdaySimpleParticipationMode =
    simpleParticipationModeType ??
    (panelState === 'checked_in_confirmed'
      ? 'checked_in'
      : panelState === 'matchday_action'
        ? 'check_in'
        : 'rsvp');

  const isSimpleRsvp = simpleParticipationModel && resolvedSimpleMode === 'rsvp';
  const isSimpleNotGoingMatchday =
    simpleParticipationModel && resolvedSimpleMode === 'not_going_matchday';
  const isSimpleCheckIn = simpleParticipationModel && resolvedSimpleMode === 'check_in';
  const isSimpleCheckedIn = simpleParticipationModel && resolvedSimpleMode === 'checked_in';
  const isSimplePreMatch = isSimpleRsvp;
  const isSimpleDeclined = isSimpleRsvp && panelState === 'pre_match' && secondarySelected;
  const isSimpleAttending = isSimpleRsvp && panelState === 'pre_match_confirmed';
  const isSimpleNeutral = isSimplePreMatch && !isSimpleAttending && !isSimpleDeclined;
  const displayedSimpleStatusText = isSimpleCheckIn
    ? 'Er du på stadion?'
    : isSimpleCheckedIn
      ? 'Du er tjekket ind.'
      : isSimpleDeclined
        ? 'Kan ikke komme.'
        : 'Kommer du?';

  const simpleSupportingText = isSimpleCheckIn
    ? 'Tjek ind og vis, at du er med på stadion i dag.'
    : isSimpleCheckedIn
      ? 'God kamp. Du er registreret blandt fans på stadion.'
      : isSimpleDeclined
        ? 'Du kan altid skifte mening inden kickoff.'
        : isSimpleNeutral
          ? 'Meld din status for kampen.'
          : null;
  const resolvedSocialCopy = isSimpleNotGoingMatchday
    ? count <= 0
      ? { countLabel: null, text: 'Ingen fans er på stadion endnu' }
      : {
          countLabel: count.toLocaleString('da-DK'),
          text: count === 1 ? 'fan er på stadion nu' : 'fans er på stadion nu',
        }
    : socialCopyOverride ?? getSocialCopy(panelState, count, simpleParticipationModel);
  const resolvedDisplayedSimpleStatusText =
    titleOverride ??
    (isSimpleCheckIn
    ? 'Klar til check-in?'
    : isSimpleCheckedIn
      ? 'Du er tjekket ind'
      : isSimpleNotGoingMatchday
        ? 'Du er ikke meldt til i dag'
        : displayedSimpleStatusText);
  const resolvedSimpleSupportingText = isSimpleCheckIn
    ? bodyOverride ?? 'Tjek ind, når du er på stadion, så andre fans kan se stemningen live.'
    : isSimpleNotGoingMatchday
      ? bodyOverride ?? 'Du kan stadig følge stemningen fra de andre fans herinde.'
      : bodyOverride ?? simpleSupportingText;
  const hasSimplePrimaryAction = hasPrimaryAction && !isSimpleNotGoingMatchday;

  const simplePrimaryAction =
    !simpleParticipationModel || !hasSimplePrimaryAction
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
    isSimpleNotGoingMatchday ||
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
        isSimpleCheckIn ? styles.socialRowSimpleMatchday : null,
        isSimpleCheckedIn ? styles.socialRowSimpleCheckedIn : null,
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
            color={
              panelState === 'checked_in_confirmed'
                ? theme.colors.state.success
                : theme.colors.info
            }
          />
        </View>
      )}

      {resolvedSocialCopy.countLabel ? (
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
            {resolvedSocialCopy.countLabel}
          </Text>
        </View>
      ) : null}

      <Text
        variant="bodyBold"
        color="primary"
        style={[styles.socialText, simpleParticipationModel ? styles.socialTextSimple : null]}
        numberOfLines={2}
      >
        {resolvedSocialCopy.text}
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
    const simpleStatusContent = isSimpleCheckIn ? (
      <View style={[styles.simpleHeroBlock, styles.simpleHeroBlockMatchday]}>
        <View style={styles.simpleHeroEyebrowRow}>
          <Ionicons
            name="flash"
            size={theme.components.icon.size.sm}
            color={theme.colors.info}
          />
          <Text variant="small" color="secondary" style={styles.simpleHeroEyebrow}>
            KAMPDAG
          </Text>
        </View>
        <Text variant="h3" color="primary" style={styles.simpleHeroTitle}>
          {resolvedDisplayedSimpleStatusText}
        </Text>
        {resolvedSimpleSupportingText ? (
          <Text variant="body" color="secondary" style={styles.simpleHeroBody}>
            {resolvedSimpleSupportingText}
          </Text>
        ) : null}
      </View>
    ) : isSimpleCheckedIn ? (
      <View style={[styles.simpleHeroBlock, styles.simpleHeroBlockCheckedIn]}>
        <View style={styles.simpleSuccessBadge}>
          <Ionicons
            name="checkmark"
            size={theme.components.icon.size.sm}
            color={theme.colors.text.inverse}
          />
        </View>
        <View style={styles.simpleSuccessCopy}>
          <Text variant="h3" color="success" style={styles.simpleHeroTitle}>
            {resolvedDisplayedSimpleStatusText}
          </Text>
          {resolvedSimpleSupportingText ? (
            <Text variant="body" color="secondary" style={styles.simpleHeroBody}>
              {resolvedSimpleSupportingText}
            </Text>
          ) : null}
          {rewardLabelOverride ? (
            <View style={styles.simpleRewardPill}>
              <Ionicons
                name="star"
                size={theme.components.icon.size.sm - 2}
                color={theme.colors.state.success}
              />
              <Text variant="small" color="success" style={styles.simpleRewardText}>
                {rewardLabelOverride}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    ) : isSimpleNotGoingMatchday ? (
      <View style={[styles.simpleStatusBlock, styles.simpleStatusBlockMatchdayInfo]}>
        <Text variant="bodyBold" color="primary" style={styles.simpleStatusText}>
          {resolvedDisplayedSimpleStatusText}
        </Text>
        {resolvedSimpleSupportingText ? (
          <Text variant="body" color="secondary" style={styles.simpleStatusBody}>
            {resolvedSimpleSupportingText}
          </Text>
        ) : null}
      </View>
    ) : !isSimpleAttending ? (
      <View style={styles.simpleStatusBlock}>
        <Text variant="bodyBold" color="primary" style={styles.simpleStatusText}>
          {resolvedDisplayedSimpleStatusText}
        </Text>
        {resolvedSimpleSupportingText ? (
          <Text variant="body" color="secondary" style={styles.simpleStatusBody}>
            {resolvedSimpleSupportingText}
          </Text>
        ) : null}
      </View>
    ) : null;

    return (
      <View
        style={[
          styles.panelSimple,
          isSimpleCheckIn ? styles.panelSimpleMatchday : null,
          panelState === 'checked_in_confirmed' ? styles.panelSimpleCheckedIn : null,
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

        {simpleStatusContent}

        {isSimpleDeclined || hasSimplePrimaryAction ? (
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

            {hasSimplePrimaryAction ? (
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
                      isSimpleCheckIn ? styles.primaryButtonSimpleCheckIn : null,
                      styles.primaryButtonSimpleBrand,
                      simplePrimaryAction.disabled ? styles.primaryButtonBusy : null,
                      pressed && !simplePrimaryAction.disabled
                        ? isSimpleCheckIn
                          ? styles.pressedScale
                          : styles.pressed
                        : null,
                    ]}
                  >
                    <Ionicons
                      name={simplePrimaryAction.icon}
                      size={
                        isSimpleCheckIn
                          ? theme.components.icon.size.md
                          : theme.components.icon.size.sm
                      }
                      color={theme.colors.text.inverse}
                    />
                    <Text
                      variant={isSimpleCheckIn ? 'h3' : 'bodyBold'}
                      style={[
                        styles.primaryText,
                        styles.primaryTextSimple,
                        styles.primaryTextAccent,
                        isSimpleCheckIn ? styles.primaryTextSimpleCheckIn : null,
                      ]}
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
    <View
      style={[
        styles.panel,
        getShadowStyle(theme, 'md'),
        isCompactMatchday ? styles.panelMatchday : null,
        isCompactCheckedIn ? styles.panelCheckedIn : null,
        style,
      ]}
    >
      <View
        style={[
          styles.panelGlow,
          isCompactMatchday ? styles.panelGlowMatchday : null,
          panelState === 'checked_in_confirmed' ? styles.panelGlowCheckedIn : null,
        ]}
      />

      <View style={styles.headerBlock}>
        <View style={styles.titleRow}>
          {panelState === 'checked_in_confirmed' ? (
            <View style={[styles.confirmBadge, styles.confirmBadgeCheckedIn]}>
              <Ionicons
                name="checkmark"
                size={theme.components.icon.size.sm}
                color={theme.colors.text.inverse}
              />
            </View>
          ) : null}
          <Text variant="h3" color="primary" style={styles.title} numberOfLines={2}>
            {resolvedTitle}
          </Text>
        </View>
        {bodyOverride ? (
          <Text variant="body" color="secondary" style={styles.subtitle} numberOfLines={2}>
            {bodyOverride}
          </Text>
        ) : null}
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
            isCompactMatchday ? styles.primaryButtonCompactMatchday : null,
            primaryIsAccent ? styles.primaryButtonAccent : styles.primaryButtonNeutral,
            resolvedPrimaryDisabled ? styles.primaryButtonBusy : null,
            pressed && !resolvedPrimaryDisabled
              ? isCompactMatchday
                ? styles.pressedScale
                : styles.pressed
              : null,
          ]}
        >
          <Ionicons
            name={getPrimaryIcon(panelState)}
            size={isCompactMatchday ? theme.components.icon.size.md : theme.components.icon.size.sm}
            color={primaryIconColor}
          />
          <Text
            variant="bodyBold"
            style={[
              styles.primaryText,
              isCompactMatchday ? styles.primaryTextCompactMatchday : null,
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
      backgroundColor: 'transparent',
      borderRadius: theme.radius.none,
      borderWidth: 0,
      borderColor: 'transparent',
      padding: theme.spacing[0],
      gap: theme.spacing[2],
    },
    panelSimpleMatchday: {
      gap: theme.spacing[2] + theme.spacing[1] / 2,
    },
    panelSimpleCheckedIn: {
      borderRadius: theme.radius.xl,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.pill.green.border,
      backgroundColor: theme.colors.pill.green.bg,
      padding: theme.layout.cardPadding,
      gap: theme.spacing[2],
    },
    panelGlow: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.info,
      opacity: theme.mode === 'light' ? 0.08 : 0.12,
    },
    panelMatchday: {
      borderColor: theme.colors.info,
    },
    panelCheckedIn: {
      borderColor: theme.colors.pill.green.border,
      backgroundColor: theme.colors.pill.green.bg,
    },
    panelGlowMatchday: {
      opacity: theme.mode === 'light' ? 0.12 : 0.16,
    },
    panelGlowCheckedIn: {
      backgroundColor: theme.colors.state.success,
      opacity: theme.mode === 'light' ? 0.12 : 0.18,
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
      backgroundColor: theme.colors.state.success,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.pill.green.border,
    },
    confirmBadgeCheckedIn: {
      backgroundColor: theme.colors.state.success,
      borderColor: theme.colors.pill.green.border,
    },
    title: {
      flex: 1,
      fontWeight: '700',
      lineHeight: theme.typography.h3.lineHeight - 1,
    },
    subtitle: {
      lineHeight: theme.typography.body.lineHeight,
      marginTop: theme.spacing[1] / 2,
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
      paddingVertical: theme.spacing[1] + theme.spacing[1] / 2,
    },
    socialRowSimpleMatchday: {
      paddingVertical: theme.spacing[2],
    },
    socialRowSimpleCheckedIn: {
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
      backgroundColor: theme.colors.bg.surface,
    },
    countPillText: {
      color: theme.colors.info,
      fontWeight: '700',
    },
    countPillTextCheckedIn: {
      color: theme.colors.state.success,
    },
    socialText: {
      flex: 1,
      lineHeight: theme.spacing[4] + theme.spacing[1] / 2,
      fontWeight: '600',
    },
    socialTextSimple: {
      fontWeight: '700',
      lineHeight: theme.typography.body.lineHeight,
    },
    socialChevron: {
      marginLeft: theme.spacing[1] / 2,
    },
    simpleStatusBlock: {
      gap: theme.spacing[1] / 2,
    },
    simpleStatusBlockMatchdayInfo: {
      paddingVertical: theme.spacing[1] / 2,
    },
    simpleStatusText: {
      lineHeight: theme.typography.body.lineHeight,
      fontWeight: '700',
    },
    simpleStatusBody: {
      lineHeight: theme.typography.body.lineHeight,
    },
    simpleHeroBlock: {
      gap: theme.spacing[1],
    },
    simpleHeroBlockMatchday: {
      gap: theme.spacing[1] + theme.spacing[1] / 2,
    },
    simpleHeroBlockCheckedIn: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing[2],
    },
    simpleHeroEyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1] / 2,
    },
    simpleHeroEyebrow: {
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    simpleHeroTitle: {
      fontWeight: '800',
      lineHeight: theme.typography.h3.lineHeight,
    },
    simpleHeroBody: {
      lineHeight: theme.typography.body.lineHeight,
    },
    simpleSuccessBadge: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.state.success,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.pill.green.border,
      marginTop: theme.spacing[1] / 2,
    },
    simpleSuccessCopy: {
      flex: 1,
      gap: theme.spacing[1] / 2,
    },
    simpleRewardPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1] / 2,
      minHeight: theme.spacing[6],
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.pill.green.border,
      backgroundColor: theme.colors.bg.surface,
      marginTop: theme.spacing[1],
    },
    simpleRewardText: {
      fontWeight: '700',
    },
    simpleDecisionGroup: {
      gap: theme.spacing[1] + theme.spacing[1] / 2,
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
      gap: theme.spacing[1] + theme.spacing[1] / 2,
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
    primaryButtonSimpleCheckIn: {
      minHeight: theme.spacing[12] + theme.spacing[1],
      borderRadius: theme.radius.md,
      paddingVertical: theme.spacing[3],
      ...getShadowStyle(theme, 'sm'),
    },
    primaryButtonAccent: {
      backgroundColor: theme.colors.info,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.info,
    },
    primaryButtonCompactMatchday: {
      minHeight: theme.spacing[10],
      borderRadius: theme.radius.md,
      ...getShadowStyle(theme, 'sm'),
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
    primaryTextSimpleCheckIn: {
      fontWeight: '800',
    },
    primaryTextAccent: {
      color: theme.colors.text.inverse,
    },
    primaryTextNeutral: {
      color: theme.colors.info,
    },
    primaryTextCompactMatchday: {
      fontWeight: '800',
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
      backgroundColor: theme.colors.bg.default,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryChoiceButtonSimpleSplit: {
      flex: 1,
      minHeight: theme.spacing[10],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.default,
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
    pressedScale: {
      opacity: 0.92,
      transform: [{ scale: 0.985 }],
    },
  });
