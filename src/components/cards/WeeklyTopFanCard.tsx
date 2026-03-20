import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../Avatar';
import { FanLevelBadge } from '../fan/FanLevelBadge';
import { Badge, Button, Card, Text } from '../ui';
import { useTheme, type Theme } from '../../theme';
import type { FanLevelKey } from '../../types/fan';

const FALLBACK_BODY = 'Har været en af ugens mest aktive fans i fællesskabet.';

export type WeeklyTopFanCardProps = {
  avatarUrl?: string | null;
  displayName: string;
  fanLevelKey: FanLevelKey;
  weekStartDate?: string;
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  contentTypeLabel?: string | null;
  highlightText?: string | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  votesCount?: number | null;
  onPressProfile: () => void;
  onPressReference?: () => void;
};

function getIsoWeekNumber(dateString?: string): number | null {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  const thursday = new Date(date);
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function extractHighlightBody(body: string): string {
  const cleaned = body
    .replace(
      /^(Fremhævet for sit opslag|Fremhævet for kommentaren|Valgt på baggrund af sit opslag|Valgt på baggrund af kommentaren|Spotlight på opslaget|Spotlight på kommentaren):\s*/i,
      '',
    )
    .trim()
    .replace(/^["“”«»]+/, '')
    .replace(/["“”«»]+$/, '')
    .trim();

  return cleaned || FALLBACK_BODY;
}

function formatMetric(value: number | null | undefined, singular: string, plural: string): string | null {
  if (typeof value !== 'number' || value <= 0) return null;
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatMetricValue(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || value <= 0) return null;
  return String(value);
}

function normalizeContentTypeLabel(label?: string | null): string | null {
  if (!label) return null;
  if (label.includes('Afstemning')) return 'Afstemning';
  if (label.includes('Opslag')) return 'Opslag';
  if (label.includes('Kommentar')) return 'Kommentar';
  return label.trim() || null;
}

export function WeeklyTopFanCard({
  avatarUrl,
  displayName,
  fanLevelKey,
  weekStartDate,
  title,
  subtitle,
  body,
  ctaLabel,
  contentTypeLabel,
  highlightText,
  likesCount,
  commentsCount,
  votesCount,
  onPressProfile,
  onPressReference,
}: WeeklyTopFanCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const weekNumber = getIsoWeekNumber(weekStartDate);
  const spotlightTitle = title.trim() || 'Ugens Topfan';
  const overline = weekNumber ? `Uge ${weekNumber} · 🏆 ${spotlightTitle}` : `🏆 ${spotlightTitle}`;
  const resolvedSubtitle = subtitle.trim() || `${displayName} er fremhævet i denne uge`;
  const resolvedBody = body.trim() || FALLBACK_BODY;
  const resolvedHighlightText = (highlightText || extractHighlightBody(resolvedBody)).trim();
  const normalizedContentTypeLabel = normalizeContentTypeLabel(contentTypeLabel);
  const metrics = [
    votesCount && votesCount > 0
      ? {
          key: 'votes',
          icon: 'bar-chart-outline' as const,
          value: formatMetricValue(votesCount)!,
          accessibilityLabel: formatMetric(votesCount, 'stemme', 'stemmer')!,
        }
      : null,
    likesCount && likesCount > 0
      ? {
          key: 'likes',
          icon: 'heart-outline' as const,
          value: formatMetricValue(likesCount)!,
          accessibilityLabel: formatMetric(likesCount, 'like', 'likes')!,
        }
      : null,
    commentsCount && commentsCount > 0
      ? {
          key: 'comments',
          icon: 'chatbubble-outline' as const,
          value: formatMetricValue(commentsCount)!,
          accessibilityLabel: formatMetric(commentsCount, 'kommentar', 'kommentarer')!,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    value: string;
    accessibilityLabel: string;
  }>;
  const gradientColors = [
    theme.colors.pill.red.bg,
    theme.colors.bg.subtle,
    theme.colors.bg.surface,
    theme.colors.bg.surface,
  ] as const;
  const gradientLocations = [0, 0.18, 0.48, 1] as const;

  return (
    <Card variant="hero" style={styles.card}>
      <LinearGradient
        colors={gradientColors}
        locations={gradientLocations}
        style={styles.gradient}
        pointerEvents="none"
      />
      <View style={styles.topHighlight} />

      <View style={styles.content}>
        <Text variant="caption" color="secondary" style={styles.overline}>
          {overline}
        </Text>

        <View style={styles.heroBlock}>
          <Pressable onPress={onPressProfile} style={styles.avatarWrap}>
            <View style={styles.avatarGlow} />
            <View style={styles.avatarRing}>
              <Avatar avatarUrl={avatarUrl} label={displayName} size={64} />
            </View>
          </Pressable>

          <Text variant="h1" color="primary" numberOfLines={2} style={styles.displayName}>
            {displayName}
          </Text>

          <Text variant="small" color="secondary" style={styles.statusLine}>
            Mest engagerede fan i denne uge
          </Text>

          <View style={styles.badgeShell}>
            <FanLevelBadge level={fanLevelKey} size="sm" labelMode="short" />
          </View>
        </View>

        <View style={styles.copyBlock}>
          <Text variant="bodyBold" color="primary" style={styles.subtitle}>
            {resolvedSubtitle}
          </Text>

          <View style={styles.reasonBlock}>
            <View style={styles.reasonAccent} />

            <View style={styles.reasonCopy}>
              <View style={styles.reasonTopRow}>
                <Text variant="caption" color="secondary" style={styles.reasonLabel}>
                  Fremhævet for bl.a.
                </Text>
                {metrics.length > 0 ? (
                  <View style={styles.metricsRow}>
                    {metrics.map((metric) => (
                      <View
                        key={metric.key}
                        style={styles.metricItem}
                        accessibilityLabel={metric.accessibilityLabel}
                      >
                        <Ionicons
                          name={metric.icon}
                          size={14}
                          color={theme.colors.text.secondary}
                        />
                        <Text variant="caption" color="secondary" style={styles.metricValue}>
                          {metric.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {normalizedContentTypeLabel ? (
                <Badge
                  label={normalizedContentTypeLabel}
                  variant={normalizedContentTypeLabel === 'Afstemning' ? 'infoSoft' : 'neutral'}
                  size="sm"
                />
              ) : null}

              <Text
                variant={onPressReference ? 'bodyBold' : 'body'}
                color={onPressReference ? 'primary' : 'secondary'}
                style={[styles.reasonBody, onPressReference && styles.reasonBodyEmphasis]}
              >
                {resolvedHighlightText}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Button title={ctaLabel} onPress={onPressProfile} variant="primary" size="sm" />
          {onPressReference ? (
            <Pressable onPress={onPressReference} style={styles.referenceAction}>
              <Text variant="caption" color="primary" style={styles.referenceActionText}>
                Se opslag →
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: theme.layout.listGap + theme.spacing[1],
      padding: theme.spacing[0],
      position: 'relative',
      overflow: 'hidden',
    },
    gradient: {
      ...StyleSheet.absoluteFillObject,
    },
    topHighlight: {
      height: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      marginHorizontal: -theme.layout.borderHairline,
      marginTop: -theme.layout.borderHairline,
    },
    content: {
      paddingHorizontal: theme.components.card.padding + theme.spacing[1],
      paddingTop: theme.components.card.padding - theme.spacing[1],
      paddingBottom: theme.components.card.padding,
      gap: theme.spacing[3],
    },
    overline: {
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      textAlign: 'center',
      opacity: 0.78,
    },
    heroBlock: {
      alignItems: 'center',
      gap: theme.spacing[0] + 2,
    },
    avatarWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      width: theme.spacing[16] + theme.spacing[6],
      height: theme.spacing[16] + theme.spacing[6],
      marginTop: theme.spacing[0] + 2,
      marginBottom: theme.spacing[1],
    },
    avatarGlow: {
      position: 'absolute',
      width: theme.spacing[14],
      height: theme.spacing[14],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
    },
    avatarRing: {
      padding: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    displayName: {
      fontWeight: '700',
      letterSpacing: -0.45,
      lineHeight: theme.typography.h1.lineHeight,
      textAlign: 'center',
      maxWidth: '92%',
    },
    statusLine: {
      textAlign: 'center',
      maxWidth: '88%',
      marginTop: theme.layout.borderWidth,
      opacity: 0.9,
    },
    badgeShell: {
      alignSelf: 'center',
      paddingHorizontal: theme.spacing[0] + 2,
      paddingVertical: theme.layout.borderWidth,
      marginTop: theme.layout.borderWidth,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.active,
    },
    copyBlock: {
      gap: theme.spacing[2],
      paddingTop: theme.spacing[1],
    },
    subtitle: {
      maxWidth: '92%',
      lineHeight: theme.typography.bodyBold.lineHeight,
      textAlign: 'center',
      alignSelf: 'center',
    },
    reasonBlock: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: theme.spacing[2],
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    reasonAccent: {
      width: theme.layout.borderWidth * 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    reasonCopy: {
      flex: 1,
      gap: theme.spacing[1],
    },
    reasonTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
      flexWrap: 'wrap',
    },
    reasonLabel: {
      letterSpacing: 0.3,
      fontWeight: '700',
    },
    metricsText: {
      textAlign: 'right',
      opacity: 0.92,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: theme.spacing[2],
      flexWrap: 'wrap',
    },
    metricItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[0] + 2,
    },
    metricValue: {
      fontWeight: '700',
    },
    reasonBody: {
      maxWidth: '100%',
      lineHeight: theme.typography.body.lineHeight,
    },
    reasonBodyEmphasis: {
      fontStyle: 'italic',
      letterSpacing: -0.1,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
      flexWrap: 'wrap',
      marginTop: theme.spacing[2],
    },
    referenceAction: {
      paddingVertical: theme.spacing[1],
    },
    referenceActionText: {
      fontWeight: '700',
    },
  });
}
