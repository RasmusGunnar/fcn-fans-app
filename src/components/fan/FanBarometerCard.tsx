import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getFanLevelMinimumScore,
  getFanLevelLabel,
  getFanLevelName,
  getFanLevelPosition,
  getNextFanLevel,
  getPointsBetweenFanLevels,
} from '../../lib/fanbarometer';
import { useTheme, type Theme } from '../../theme';
import type { FanLevelKey } from '../../types/fan';
import { cleanText } from '../../utils/text';
import { Card, Text } from '../ui';
import { ShieldIcon } from './ShieldIcon';

export type FanBarometerCardProps = {
  level: FanLevelKey;
  score?: number;
  progress?: number;
  nextLevel?: FanLevelKey | null;
  pointsToNext?: number | null;
  state?: 'ready' | 'loading' | 'empty';
  scoreLabel?: string;
  scoreValueText?: string;
  showScoreBlock?: boolean;
  showProgressSection?: boolean;
  secondarySectionTitle?: string;
  secondarySectionValue?: string | null;
  secondarySectionNote?: string | null;
  footerNote?: string;
};

const POINT_RULES = [
  { key: 'posts', label: 'Opslag', value: '+8' },
  { key: 'comments', label: 'Kommentar', value: '+2' },
  { key: 'checkins', label: 'Check-in', value: '+10 / +18 ude' },
  { key: 'likes', label: 'Likes', value: '+1' },
] as const;

function normalizeScore(score: number | undefined): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.round(score));
}

function normalizeProgress(progress: number | undefined): number | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
  return Math.max(0, Math.min(1, progress));
}

function formatPointCount(points: number): string {
  return `${Math.max(0, Math.round(points)).toLocaleString('da-DK')} point`;
}

function decodeUnicodeEscapes(input: string | null | undefined): string {
  if (typeof input !== 'string' || !input) {
    return '';
  }

  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function cleanBarometerText(input: string | null | undefined): string {
  return cleanText(decodeUnicodeEscapes(input));
}

export function FanBarometerCard({
  level,
  score,
  progress,
  nextLevel,
  pointsToNext,
  state = 'ready',
  scoreLabel = 'FAN-SCORE',
  scoreValueText,
  showScoreBlock = true,
  showProgressSection = true,
  secondarySectionTitle,
  secondarySectionValue,
  secondarySectionNote,
  footerNote,
}: FanBarometerCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const gradientColors = [theme.colors.bg.surface, theme.colors.bg.subtle] as const;

  const renderSurface = (content: React.ReactNode) => (
    <Card variant="raised" style={styles.card}>
      <LinearGradient colors={gradientColors} style={styles.gradient} pointerEvents="none" />
      <View style={styles.topHighlight} />
      <View style={styles.cardContent}>{content}</View>
    </Card>
  );

  if (state === 'empty') {
    return renderSurface(
      <View style={styles.emptyBlock}>
        <Text variant="h3" color="primary">
          Din fanstatus er på vej
        </Text>
        <Text variant="body" color="secondary" style={styles.emptyText}>
          Niveauet vises her, når profilen er klar.
        </Text>
      </View>,
    );
  }

  if (state === 'loading') {
    return renderSurface(
      <View style={styles.loadingBlock}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <View style={styles.loadingCopy}>
          <Text variant="h3" color="primary">
            Din fanstatus
          </Text>
          <Text variant="body" color="secondary">
            Henter din samlede status...
          </Text>
        </View>
      </View>,
    );
  }

  const currentLevelName = getFanLevelName(level);
  const currentLevelLabel = getFanLevelLabel(level, 'full');
  const levelPosition = getFanLevelPosition(level);
  const resolvedNextLevel = nextLevel === undefined ? getNextFanLevel(level) : nextLevel;
  const nextLevelName = resolvedNextLevel ? getFanLevelName(resolvedNextLevel) : null;
  const scoreValue = normalizeScore(score);
  const scoreDisplayValue = scoreValueText ?? scoreValue.toLocaleString('da-DK');
  const hasScoreBlock = showScoreBlock && (scoreValueText != null || typeof score === 'number');
  const progressValue = normalizeProgress(progress);
  const currentLevelMinScore = getFanLevelMinimumScore(level);
  const nextLevelMinScore = resolvedNextLevel ? getFanLevelMinimumScore(resolvedNextLevel) : null;
  const pointsBetweenLevels = getPointsBetweenFanLevels(level);
  const safePointsToNext =
    typeof pointsToNext === 'number' && Number.isFinite(pointsToNext)
      ? Math.max(0, Math.ceil(pointsToNext))
      : null;
  const hasSecondarySection =
    cleanBarometerText(secondarySectionValue).trim().length > 0;
  const cleanedCurrentLevelName = cleanBarometerText(currentLevelName) || currentLevelName;
  const cleanedCurrentLevelLabel = cleanBarometerText(currentLevelLabel) || currentLevelLabel;
  const cleanedNextLevelName = nextLevelName ? cleanBarometerText(nextLevelName) || nextLevelName : null;
  const cleanedSecondaryValue = cleanBarometerText(secondarySectionValue);
  const cleanedSecondaryNote = cleanBarometerText(secondarySectionNote);
  const cleanedFooterNote = cleanBarometerText(footerNote);
  const progressionNote = cleanedNextLevelName
    ? safePointsToNext !== null
      ? `${formatPointCount(safePointsToNext)} til ${cleanedNextLevelName}.`
      : `${cleanedNextLevelName} starter ved ${formatPointCount(nextLevelMinScore ?? 0)}${
          pointsBetweenLevels !== null
            ? ` (${formatPointCount(pointsBetweenLevels)} over nuværende niveau).`
            : '.'
        }`
    : `Topniveau starter ved ${formatPointCount(currentLevelMinScore)}.`;

  return renderSurface(
    <>
      <View style={styles.headerBlock}>
        <Text variant="h3" color="primary">
          Din fanstatus
        </Text>
        <Text variant="caption" color="secondary" style={styles.subtitle}>
          Samlet niveau
        </Text>
      </View>

      <View style={styles.statusShell}>
        <View style={styles.summaryRow}>
          <View style={styles.iconShell}>
            <ShieldIcon level={level} size="lg" />
          </View>

          <View style={styles.statusCopy}>
            <Text variant="caption" color="secondary" style={styles.statusLabel}>
              Nuværende niveau
            </Text>
            <Text variant="h2" color="primary" style={styles.levelName}>
              {cleanedCurrentLevelName}
            </Text>
            <Text variant="small" color="secondary" style={styles.levelSummary}>
              {cleanedCurrentLevelLabel}
            </Text>
          </View>

          {hasScoreBlock ? (
            <View style={styles.scoreBlock}>
              <Text variant="small" color="muted" style={styles.scoreLabel}>
                {scoreLabel}
              </Text>
              <Text variant="h2" color="primary" style={styles.scoreValue}>
                {scoreDisplayValue}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {showProgressSection ? (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text variant="bodyBold" color="primary" style={styles.progressHeading}>
              {cleanedNextLevelName
                ? `På vej mod ${cleanedNextLevelName}`
                : 'Du er på topniveau'}
            </Text>
          </View>

          <View style={styles.levelTrack}>
            {Array.from({ length: levelPosition.total }).map((_, index) => {
              const stepNumber = index + 1;
              const isCompleted = stepNumber < levelPosition.current;
              const isCurrent = stepNumber === levelPosition.current;

              return (
                <View
                  key={`fan-level-step-${stepNumber}`}
                  style={[
                    styles.levelTrackSegment,
                    isCompleted ? styles.levelTrackSegmentCompleted : styles.levelTrackSegmentFuture,
                    isCurrent ? styles.levelTrackSegmentCurrent : null,
                  ]}
                />
              );
            })}
          </View>

          {progressValue !== null ? (
            <View style={styles.progressBar}>
              <View style={[styles.progressBarFill, { width: `${progressValue * 100}%` }]} />
            </View>
          ) : null}

          <Text variant="small" color="secondary" style={styles.nextStepNote}>
            {progressionNote}
          </Text>
        </View>
      ) : null}

      {hasSecondarySection ? (
        <View style={styles.secondarySection}>
          <Text variant="caption" color="secondary" style={styles.secondarySectionLabel}>
            {secondarySectionTitle ?? 'Denne uge'}
          </Text>
          <Text variant="bodyBold" color="primary" style={styles.secondarySectionValue}>
            {cleanedSecondaryValue}
          </Text>
          {cleanedSecondaryNote ? (
            <Text variant="small" color="secondary" style={styles.secondarySectionNote}>
              {cleanedSecondaryNote}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.infoSection}>
        <Text variant="caption" color="secondary" style={styles.infoLabel}>
          Det tæller
        </Text>

        <View style={styles.pointsGrid}>
          {POINT_RULES.map((rule) => (
            <View key={rule.key} style={styles.pointChip}>
              <Text variant="caption" color="secondary" style={styles.pointChipLabel}>
                {rule.label}
              </Text>
              <Text variant="caption" color="primary" style={styles.pointChipValue}>
                {rule.value}
              </Text>
            </View>
          ))}
        </View>

        {cleanedFooterNote ? (
          <Text variant="caption" color="secondary" style={styles.footerNote}>
            {cleanedFooterNote}
          </Text>
        ) : null}
      </View>
    </>,
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      padding: theme.spacing[0],
      position: 'relative',
    },
    gradient: {
      ...StyleSheet.absoluteFillObject,
    },
    topHighlight: {
      height: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    cardContent: {
      paddingHorizontal: theme.components.card.padding,
      paddingTop: theme.components.card.padding + theme.spacing[1],
      paddingBottom: theme.components.card.padding + theme.spacing[1],
      gap: theme.spacing[3],
    },
    headerBlock: {
      gap: theme.spacing[0],
    },
    subtitle: {
      maxWidth: '88%',
    },
    emptyBlock: {
      gap: theme.spacing[1],
    },
    emptyText: {
      maxWidth: '88%',
    },
    loadingBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
    },
    loadingCopy: {
      gap: theme.spacing[0],
    },
    statusShell: {
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
    },
    iconShell: {
      width: theme.spacing[14],
      height: theme.spacing[14],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.active,
    },
    statusCopy: {
      flex: 1,
      minWidth: 0,
      gap: theme.spacing[0],
    },
    statusLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    levelName: {
      letterSpacing: -0.45,
      fontWeight: '700',
      flexShrink: 1,
    },
    levelSummary: {
      marginTop: theme.spacing[0],
      maxWidth: '96%',
    },
    scoreBlock: {
      minWidth: theme.spacing[12],
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
    },
    scoreLabel: {
      marginBottom: theme.spacing[0],
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    scoreValue: {
      textAlign: 'right',
      letterSpacing: -0.3,
    },
    progressSection: {
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
    },
    progressHeader: {
      gap: theme.spacing[0],
    },
    progressHeading: {
      maxWidth: '96%',
    },
    levelTrack: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      marginTop: theme.spacing[1],
    },
    levelTrackSegment: {
      flex: 1,
      height: theme.spacing[2],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
    },
    levelTrackSegmentCompleted: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      opacity: 1,
    },
    levelTrackSegmentCurrent: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      borderWidth: theme.layout.borderWidth,
      opacity: 0.72,
    },
    levelTrackSegmentFuture: {
      backgroundColor: theme.colors.bg.subtle,
      borderColor: theme.colors.border.default,
    },
    nextStepNote: {
      maxWidth: '92%',
    },
    progressBar: {
      height: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    secondarySection: {
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[2] + theme.layout.borderHairline,
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.bg.canvas,
    },
    secondarySectionLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    secondarySectionValue: {
      flexShrink: 1,
    },
    secondarySectionNote: {
      color: theme.colors.text.secondary,
    },
    infoSection: {
      gap: theme.spacing[2],
    },
    infoLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    pointsGrid: {
      gap: theme.spacing[2],
    },
    pointChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.elevated,
    },
    pointChipLabel: {
      fontWeight: '600',
      flexShrink: 1,
    },
    pointChipValue: {
      fontWeight: '700',
    },
    footerNote: {
      maxWidth: '96%',
      lineHeight: theme.typography.caption.lineHeight,
    },
  });
}
