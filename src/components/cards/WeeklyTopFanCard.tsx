import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../Avatar';
import { FanLevelBadge } from '../fan/FanLevelBadge';
import { Badge, Button, Card, Text } from '../ui';
import { useTheme, type Theme } from '../../theme';
import type { FanLevelKey } from '../../types/fan';
import { cleanText } from '../../utils/text';

const FALLBACK_BODY = 'Har v\u00e6ret blandt de mest aktive fans i f\u00e6llesskabet.';

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

function decodeUnicodeEscapes(input: string | null | undefined): string {
  if (typeof input !== 'string' || !input) {
    return '';
  }

  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function cleanCardText(input: string | null | undefined): string {
  return cleanText(decodeUnicodeEscapes(input));
}

function extractHighlightBody(body: string): string {
  const cleaned = cleanCardText(body)
    .replace(
      /^(Fremh\u00e6vet for sit opslag|Fremh\u00e6vet for kommentaren|Valgt p\u00e5 baggrund af sit opslag|Valgt p\u00e5 baggrund af kommentaren|Spotlight p\u00e5 opslaget|Spotlight p\u00e5 kommentaren):\s*/i,
      '',
    )
    .trim()
    .replace(/^["\u00ab\u00bb]+/, '')
    .replace(/["\u00ab\u00bb]+$/, '')
    .trim();

  return cleaned || FALLBACK_BODY;
}

function formatMetric(
  value: number | null | undefined,
  singular: string,
  plural: string,
): string | null {
  if (typeof value !== 'number' || value <= 0) return null;
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatMetricValue(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || value <= 0) return null;
  return String(value);
}

function normalizeContentTypeLabel(label?: string | null): string | null {
  const cleanedLabel = cleanCardText(label).trim();
  if (!cleanedLabel) return null;
  if (cleanedLabel.includes('Afstemning')) return 'Afstemning';
  if (cleanedLabel.includes('Opslag')) return 'Opslag';
  if (cleanedLabel.includes('Kommentar')) return 'Kommentar';
  return cleanedLabel || null;
}

function buildOverline(weekNumber: number | null): string {
  return weekNumber ? `Topfan \u00b7 Uge ${weekNumber}` : 'Seneste topfan';
}

function buildStatusLine(weekNumber: number | null): string {
  return weekNumber
    ? `Mest engagerede fan i uge ${weekNumber}`
    : 'Fremh\u00e6vet fan i f\u00e6llesskabet';
}

function buildHeroSummary(
  weekNumber: number | null,
  contentTypeLabel: string | null,
  hasReference: boolean,
): string {
  if (contentTypeLabel === 'Opslag') {
    return weekNumber ? 'Ugens st\u00e6rkeste opslag' : 'St\u00e6rkt opslag i f\u00e6llesskabet';
  }

  if (contentTypeLabel === 'Kommentar') {
    return weekNumber ? 'St\u00e6rk stemme i kommentarerne' : 'Fremh\u00e6vet kommentar';
  }

  if (contentTypeLabel === 'Afstemning') {
    return weekNumber ? 'Skabte engagement i ugens afstemning' : 'Skabte engagement omkring en afstemning';
  }

  if (hasReference) {
    return weekNumber ? 'Ugens st\u00e6rkeste bidrag' : 'Fremh\u00e6vet bidrag i f\u00e6llesskabet';
  }

  return weekNumber ? `Fremh\u00e6vet for uge ${weekNumber}` : 'Fremh\u00e6vet i f\u00e6llesskabet';
}

function buildHighlightLabel(contentTypeLabel: string | null): string {
  if (contentTypeLabel === 'Opslag') return 'Fremh\u00e6vet opslag';
  if (contentTypeLabel === 'Kommentar') return 'Fremh\u00e6vet kommentar';
  if (contentTypeLabel === 'Afstemning') return 'Fremh\u00e6vet afstemning';
  return 'Fremh\u00e6vet bidrag';
}

export function WeeklyTopFanCard({
  avatarUrl,
  displayName,
  fanLevelKey,
  weekStartDate,
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
  const cleanedDisplayName = cleanCardText(displayName).trim() || 'Fan';
  const normalizedContentTypeLabel = normalizeContentTypeLabel(contentTypeLabel);
  const overline = buildOverline(weekNumber);
  const statusLine = buildStatusLine(weekNumber);
  const resolvedSubtitle = buildHeroSummary(
    weekNumber,
    normalizedContentTypeLabel,
    Boolean(onPressReference),
  );
  const resolvedBody = cleanCardText(body).trim() || FALLBACK_BODY;
  const resolvedHighlightText =
    cleanCardText(highlightText).trim() || extractHighlightBody(resolvedBody).trim();
  const cleanedCtaLabel = cleanCardText(ctaLabel).trim() || 'Se profil';
  const highlightLabel = buildHighlightLabel(normalizedContentTypeLabel);
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
  ].filter(Boolean) as {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    value: string;
    accessibilityLabel: string;
  }[];
  const gradientColors = [
    theme.colors.pill.red.bg,
    theme.colors.bg.subtle,
    theme.colors.bg.surface,
    theme.colors.bg.surface,
  ] as const;
  const gradientLocations = [0, 0.16, 0.46, 1] as const;

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
        <View style={styles.kickerRow}>
          <View style={styles.kickerPill}>
            <Ionicons name="trophy-outline" size={14} color={theme.colors.primary} />
            <Text variant="caption" color="primary" style={styles.kickerText}>
              {overline}
            </Text>
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Pressable onPress={onPressProfile} style={styles.avatarWrap}>
            <View style={styles.avatarGlow} />
            <View style={styles.avatarRing}>
              <Avatar avatarUrl={avatarUrl} label={cleanedDisplayName} size={64} />
            </View>
          </Pressable>

          <Text variant="h1" color="primary" numberOfLines={2} style={styles.displayName}>
            {cleanedDisplayName}
          </Text>

          <Text variant="small" color="secondary" style={styles.statusLine}>
            {statusLine}
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
            <View style={styles.reasonHeader}>
              <View style={styles.reasonLabelRow}>
                <Ionicons name="sparkles-outline" size={14} color={theme.colors.primary} />
                <Text variant="caption" color="secondary" style={styles.reasonLabel}>
                  {highlightLabel}
                </Text>
              </View>

              {normalizedContentTypeLabel ? (
                <Badge
                  label={normalizedContentTypeLabel}
                  variant={normalizedContentTypeLabel === 'Afstemning' ? 'infoSoft' : 'neutral'}
                  size="sm"
                />
              ) : null}
            </View>

            <Text
              variant={onPressReference ? 'bodyBold' : 'body'}
              color={onPressReference ? 'primary' : 'secondary'}
              numberOfLines={4}
              style={styles.reasonBody}
            >
              {resolvedHighlightText}
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
        </View>

        <View style={styles.actionsRow}>
          <View style={[styles.actionWrap, !onPressReference && styles.actionWrapSingle]}>
            <Button
              title={cleanedCtaLabel}
              onPress={onPressProfile}
              variant="primary"
              size="sm"
              fullWidth
            />
          </View>

          {onPressReference ? (
            <View style={styles.actionWrap}>
              <Button title="Se opslag" onPress={onPressReference} variant="outline" size="sm" fullWidth />
            </View>
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
      height: theme.spacing[1] + theme.layout.borderWidth,
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
    kickerRow: {
      alignItems: 'center',
    },
    kickerPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.active,
    },
    kickerText: {
      textTransform: 'uppercase',
      letterSpacing: 0.9,
      fontWeight: '700',
    },
    heroBlock: {
      alignItems: 'center',
      gap: theme.spacing[1],
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
      width: theme.spacing[16] + theme.spacing[2],
      height: theme.spacing[16] + theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.pill.red.bg,
      opacity: 0.22,
    },
    avatarRing: {
      padding: theme.spacing[1] + theme.layout.borderHairline,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.active,
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
      gap: theme.spacing[3],
      paddingTop: theme.spacing[2],
    },
    subtitle: {
      maxWidth: '88%',
      lineHeight: theme.typography.bodyBold.lineHeight,
      textAlign: 'center',
      alignSelf: 'center',
    },
    reasonBlock: {
      gap: theme.spacing[2],
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    reasonHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
      flexWrap: 'wrap',
    },
    reasonLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    reasonLabel: {
      letterSpacing: 0.3,
      fontWeight: '700',
    },
    reasonBody: {
      maxWidth: '100%',
      lineHeight: theme.typography.body.lineHeight,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: theme.spacing[2],
      flexWrap: 'wrap',
      paddingTop: theme.spacing[1],
      borderTopWidth: theme.layout.borderHairline,
      borderTopColor: theme.colors.border.subtle,
    },
    metricItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[0] + 2,
    },
    metricValue: {
      fontWeight: '700',
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    actionWrap: {
      flex: 1,
    },
    actionWrapSingle: {
      flexBasis: '100%',
    },
  });
}
