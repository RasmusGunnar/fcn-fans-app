import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getFanLevelDescription, getFanLevelLabel } from '../../lib/fanbarometer';
import { useTheme, type Theme } from '../../theme';
import type { FanLevelKey } from '../../types/fan';
import { Card, Text } from '../ui';
import { ShieldIcon } from './ShieldIcon';

export type FanBarometerCardProps = {
  level: FanLevelKey;
  score: number;
  progress: number;
  nextLevel?: FanLevelKey | null;
  pointsToNext?: number | null;
  state?: 'ready' | 'loading' | 'empty';
  scoreLabel?: string;
  scoreValueText?: string;
  showProgressSection?: boolean;
  footerNote?: string;
};

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
}

function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.round(score));
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
  showProgressSection = true,
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
      <View style={styles.headerBlock}>
        <Text variant="h3" color="primary">
          Din fanstatus er på vej
        </Text>
        <Text variant="body" color="secondary" style={styles.subtitle}>
          Når din aktivitet er klar, vises dit niveau og din progression her.
        </Text>
      </View>,
    );
  }

  if (state === 'loading') {
    return renderSurface(
      <>
        <View style={styles.headerBlock}>
          <Text variant="h3" color="primary">
            Din fanstatus
          </Text>
          <Text variant="caption" color="secondary" style={styles.subtitle}>
            Aktivitet som fan
          </Text>
        </View>
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="body" color="secondary" style={styles.loadingText}>
            Henter din fanstatus...
          </Text>
        </View>
      </>,
    );
  }

  const levelLabel = getFanLevelLabel(level, 'full');
  const levelDescription = getFanLevelDescription(level);
  const scoreValue = normalizeScore(score);
  const scoreDisplayValue = scoreValueText ?? scoreValue.toLocaleString('da-DK');
  const progressValue = clampProgress(progress);
  const nextLevelLabel = nextLevel ? getFanLevelLabel(nextLevel, 'short') : null;
  const pointsRemaining =
    pointsToNext == null ? null : Math.max(0, Math.round(pointsToNext));

  return renderSurface(
    <>
      <View style={styles.headerBlock}>
        <Text variant="h3" color="primary">
          Din fanstatus
        </Text>
        <Text variant="caption" color="secondary" style={styles.subtitle}>
          Aktivitet som fan
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.levelHero}>
          <ShieldIcon level={level} size="lg" />
          <Text variant="h2" color="primary" style={styles.levelName}>
            {levelLabel}
          </Text>
        </View>

        <View style={styles.scoreBlock}>
          <Text variant="small" color="muted" style={styles.scoreLabel}>
            {scoreLabel}
          </Text>
          <Text variant="h2" color="primary" style={styles.scoreValue}>
            {scoreDisplayValue}
          </Text>
        </View>
      </View>

      <View style={styles.identityBlock}>
        <Text variant="small" color="secondary" style={styles.levelDescription}>
          {levelDescription}
        </Text>
        <Text variant="small" color="muted" style={styles.emotionLine}>
          Du er en aktiv del af FCN-fællesskabet
        </Text>
        <Text variant="small" color="secondary" style={styles.motivationLine}>
          Din fanstatus stiger, når du deltager, poster og engagerer dig.
        </Text>
      </View>

      {showProgressSection ? (
        <View style={styles.progressSection}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressValue * 100}%` }]} />
          </View>

          {nextLevelLabel ? (
            <View style={styles.progressCopy}>
              <Text variant="caption" color="primary">
                Næste niveau: {nextLevelLabel}
              </Text>
              {pointsRemaining != null ? (
                <Text variant="caption" color="muted">
                  {pointsRemaining.toLocaleString('da-DK')} point til næste niveau
                </Text>
              ) : null}
            </View>
          ) : (
            <Text variant="body" color="primary" style={styles.topLevelText}>
              Du er på højeste niveau i Fanbarometeret
            </Text>
          )}
        </View>
      ) : footerNote ? (
        <View style={styles.progressSection}>
          <Text variant="body" color="secondary" style={styles.topLevelText}>
            {footerNote}
          </Text>
        </View>
      ) : null}
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
      height: 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    cardContent: {
      paddingHorizontal: theme.components.card.padding,
      paddingTop: theme.components.card.padding + theme.spacing[1],
      paddingBottom: theme.components.card.padding + theme.spacing[1],
    },
    headerBlock: {
      gap: theme.spacing[0],
      marginBottom: theme.spacing[3],
    },
    subtitle: {
      maxWidth: '88%',
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
    },
    levelHero: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      gap: theme.spacing[2],
      paddingRight: theme.spacing[2],
    },
    scoreBlock: {
      minWidth: theme.spacing[12],
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      marginLeft: theme.spacing[3],
      paddingTop: theme.spacing[1],
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
    identityBlock: {
      gap: theme.spacing[1],
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[4],
    },
    levelDescription: {
      maxWidth: '92%',
    },
    levelName: {
      letterSpacing: -0.45,
      flexShrink: 1,
      fontWeight: '700',
    },
    emotionLine: {
      maxWidth: '88%',
    },
    motivationLine: {
      maxWidth: '92%',
    },
    progressSection: {
      gap: theme.spacing[2],
      marginTop: theme.spacing[0],
    },
    progressTrack: {
      height: theme.spacing[1],
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.subtle,
    },
    progressFill: {
      height: '100%',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primaryDark,
    },
    progressCopy: {
      gap: theme.spacing[0],
      paddingTop: theme.spacing[1] + theme.layout.borderHairline,
    },
    topLevelText: {
      color: theme.colors.text.secondary,
    },
    loadingBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      paddingTop: theme.spacing[1],
    },
    loadingText: {
      color: theme.colors.text.secondary,
    },
  });
}
