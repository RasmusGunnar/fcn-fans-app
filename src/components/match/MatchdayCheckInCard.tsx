import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Card, Text } from '../ui';

export type MatchdayCheckInCardState = 'details' | 'check_in' | 'checked_in';

interface MatchdayCheckInCardProps {
  eyebrow?: string;
  avatars: string[];
  count: number;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaState: MatchdayCheckInCardState;
  ctaDisabled?: boolean;
  onPressCta: () => void;
  onPressInfo?: () => void;
  style?: StyleProp<ViewStyle>;
}

function getDisplayEyebrow(eyebrow?: string): string | null {
  if (!eyebrow) return null;
  if (/matchday/i.test(eyebrow)) return 'KAMPDAG';
  return eyebrow.trim().toUpperCase();
}

function getDisplayTitle({
  title,
  count,
  isCheckedInState,
}: {
  title: string;
  count: number;
  isCheckedInState: boolean;
}): string {
  if (isCheckedInState) return title;
  if (/p\u00e5 stadion/i.test(title)) {
    return `${count.toLocaleString('da-DK')} ${count === 1 ? 'fan' : 'fans'} p\u00e5 stadion`;
  }
  return title;
}

function getSocialLine({
  title,
  count,
  isCheckedInState,
}: {
  title: string;
  count: number;
  isCheckedInState: boolean;
}): string | null {
  if (count <= 0) return null;

  const socialLabel = /kommer/i.test(title)
    ? `${count.toLocaleString('da-DK')} ${count === 1 ? 'fan' : 'fans'} kommer`
    : `${count.toLocaleString('da-DK')} ${count === 1 ? 'fan' : 'fans'} på stadion`;

  if (isCheckedInState) return socialLabel;
  return null;
}

export function MatchdayCheckInCard({
  eyebrow,
  avatars,
  count,
  title,
  subtitle,
  ctaLabel,
  ctaState,
  ctaDisabled = false,
  onPressCta,
  onPressInfo,
  style,
}: MatchdayCheckInCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const visibleAvatars = avatars.slice(0, 3);
  const showAvatarRow = visibleAvatars.length > 1;
  const isCheckedInState = ctaState === 'checked_in';
  const isDetailsState = ctaState === 'details';
  const displayTitle = getDisplayTitle({ title, count, isCheckedInState });
  const displayEyebrow = getDisplayEyebrow(eyebrow);
  const socialLine = getSocialLine({ title: displayTitle, count, isCheckedInState });
  const showSupportRow = showAvatarRow || Boolean(socialLine);
  const ctaBackgroundColor = ctaDisabled
    ? theme.components.button.disabled.bg
    : isDetailsState
      ? theme.colors.pill.red.bg
      : theme.components.button.variants.primary.bg;
  const ctaTextColor = ctaDisabled
    ? theme.components.button.disabled.text
    : isDetailsState
      ? theme.colors.pill.red.text
      : theme.components.button.variants.primary.text;
  const ctaBorderColor = ctaDisabled
    ? theme.colors.border.subtle
    : isDetailsState
      ? theme.colors.border.active
      : 'transparent';
  const content = (
    <View style={styles.contentBlock}>
      {displayEyebrow ? (
        <View style={styles.headerRow}>
          <Text variant="small" color="secondary" style={styles.eyebrow}>
            {displayEyebrow}
          </Text>
        </View>
      ) : null}

      <Text variant="h3" color="primary" style={styles.title} numberOfLines={2}>
        {displayTitle}
      </Text>

      <Text variant="body" color="secondary" style={styles.subtitle} numberOfLines={2}>
        {subtitle}
      </Text>

      {showSupportRow ? (
        <View style={styles.supportRow}>
          <View style={styles.supportLead}>
            {showAvatarRow ? (
              <View style={styles.avatarStack}>
                {visibleAvatars.map((avatarUrl, index) => (
                  <Image
                    key={`${avatarUrl}-${index}`}
                    source={{ uri: avatarUrl }}
                    style={[styles.avatarBubble, index > 0 ? styles.avatarOverlap : null]}
                  />
                ))}
              </View>
            ) : null}

            {socialLine ? (
              <Text variant="caption" color="secondary" style={styles.socialText} numberOfLines={1}>
                {socialLine}
              </Text>
            ) : null}
          </View>

          {onPressInfo ? (
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text.secondary} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Card variant="raised" style={[styles.card, isCheckedInState ? styles.cardCheckedIn : null, style]}>
      {onPressInfo ? (
        <Pressable
          onPress={onPressInfo}
          style={styles.infoPressable}
          android_ripple={{ color: theme.colors.overlay.light }}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.infoContainer}>{content}</View>
      )}

      {!isCheckedInState ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={onPressCta}
            disabled={ctaDisabled}
            style={[
              styles.ctaButton,
              {
                backgroundColor: ctaBackgroundColor,
                borderColor: ctaBorderColor,
                borderWidth: theme.layout.borderHairline,
              },
            ]}
            android_ripple={ctaDisabled ? undefined : { color: theme.colors.overlay.light }}
          >
            <Text variant="bodyBold" style={[styles.ctaText, { color: ctaTextColor }]} numberOfLines={1}>
              {ctaLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    card: {
      marginBottom: theme.spacing[0],
      backgroundColor: theme.colors.bg.card,
      borderColor: theme.colors.pill.red.bg,
    },
    cardCheckedIn: {
      borderColor: theme.colors.border.subtle,
    },
    infoContainer: {
      width: '100%',
    },
    infoPressable: {
      width: '100%',
    },
    contentBlock: {
      minWidth: 0,
      gap: theme.spacing[2],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: theme.spacing[4],
    },
    eyebrow: {
      fontWeight: '700',
      letterSpacing: 0.8,
      color: theme.colors.text.secondary,
    },
    title: {
      width: '100%',
      fontWeight: '700',
      lineHeight: 24,
      color: theme.colors.text.primary,
    },
    subtitle: {
      width: '100%',
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      color: theme.colors.text.secondary,
    },
    supportRow: {
      marginTop: theme.spacing[1],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
    },
    supportLead: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: theme.spacing[2],
    },
    avatarStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarBubble: {
      width: 28,
      height: 28,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderColor: theme.colors.bg.card,
      backgroundColor: theme.colors.pill.red.bg,
    },
    avatarOverlap: {
      marginLeft: -(theme.spacing[2] + theme.spacing[1] / 2),
    },
    socialText: {
      fontWeight: '700',
      lineHeight: 18,
    },
    actionRow: {
      marginTop: theme.spacing[3],
    },
    ctaButton: {
      width: '100%',
      minHeight: 44,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      borderRadius: theme.components.button.radius,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ctaText: {
      textAlign: 'center',
      lineHeight: 22,
    },
  });
