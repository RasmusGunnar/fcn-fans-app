import React from 'react';
import { View, Image, StyleSheet, ImageSourcePropType } from 'react-native';
import { useTheme, Theme } from '../../theme';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { Badge } from '../ui/Badge';
import { PrimaryButton } from '../PrimaryButton';

export type NextMatchState = 'upcoming' | 'live' | 'member';

export interface NextMatchCardProps {
  dateText: string;
  venueText: string;
  homeTeamName: string;
  awayTeamName: string;
  homeLogo?: ImageSourcePropType;
  awayLogo?: ImageSourcePropType;
  state?: NextMatchState;
  kickoffLabel?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

/**
 * NextMatchCard - Reusable next match widget
 * 
 * DO NOT hardcode colors/padding/margin/radius/shadows
 * Uses theme tokens exclusively via createStyles(theme) pattern
 */
export function NextMatchCard({
  dateText,
  venueText,
  homeTeamName,
  awayTeamName,
  homeLogo,
  awayLogo,
  state = 'upcoming',
  kickoffLabel,
  ctaLabel,
  onPressCta,
}: NextMatchCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getBorderColor = () => {
    switch (state) {
      case 'live':
        return theme.colors.border.active;
      case 'member':
        return theme.colors.border.default;
      default:
        return theme.colors.border.default;
    }
  };

  const renderTeamLogo = (logo?: ImageSourcePropType, teamName?: string) => {
    if (logo) {
      return (
        <Image
          source={logo}
          style={styles.teamLogo}
          resizeMode="contain"
        />
      );
    }
    // Fallback circle with team initial
    return (
      <View style={styles.teamLogoFallback}>
        <Text variant="h3" style={{ color: theme.colors.text.inverse }}>
          {teamName?.[0] || '?'}
        </Text>
      </View>
    );
  };

  return (
    <Card
      variant="hero"
      style={[
        styles.container,
        { borderColor: getBorderColor(), borderWidth: theme.layout.borderHairline },
      ]}
    >
      {/* Header - Date & Venue */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="caption" style={{ color: theme.colors.text.secondary }}>
            {dateText}
          </Text>
          <Text variant="caption" style={{ color: theme.colors.text.muted, marginTop: theme.spacing[0] }}>
            {venueText}
          </Text>
        </View>
        {kickoffLabel && (
          <Badge
            label={kickoffLabel}
            variant={state === 'member' ? 'brand' : state === 'live' ? 'error' : 'neutral'}
            size="sm"
          />
        )}
      </View>

      {/* Divider */}
      <View
        style={[
          styles.divider,
          { borderBottomColor: theme.colors.border.subtle, borderBottomWidth: theme.layout.borderHairline },
        ]}
      />

      {/* Match Row - Teams */}
      <View style={styles.matchRow}>
        {/* Home Team */}
        <View style={styles.team}>
          {renderTeamLogo(homeLogo, homeTeamName)}
          <Text variant="body" style={[styles.teamName, { color: theme.colors.text.primary }]}>
            {homeTeamName}
          </Text>
        </View>

        {/* VS */}
        <Text variant="body" style={[styles.vs, { color: theme.colors.text.secondary }]}>
          VS
        </Text>

        {/* Away Team */}
        <View style={styles.team}>
          {renderTeamLogo(awayLogo, awayTeamName)}
          <Text variant="body" style={[styles.teamName, { color: theme.colors.text.primary }]}>
            {awayTeamName}
          </Text>
        </View>
      </View>

      {/* CTA Button */}
      {ctaLabel && onPressCta && (
        <>
          <View
            style={[
              styles.divider,
              { borderBottomColor: theme.colors.border.subtle, borderBottomWidth: theme.layout.borderHairline },
            ]}
          />
          <View style={styles.ctaContainer}>
            <PrimaryButton title={ctaLabel} onPress={onPressCta} />
          </View>
        </>
      )}

      {/* Member Badge (if member state) */}
      {state === 'member' && (
        <View
          style={[
            styles.memberBadge,
            { backgroundColor: theme.colors.brand.gold },
          ]}
        >
          <Text variant="small" style={{ color: theme.colors.text.inverse, fontWeight: '700' }}>
            MEDLEM
          </Text>
        </View>
      )}
    </Card>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      overflow: 'visible',
      position: 'relative',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: theme.spacing[4],
    },
    headerLeft: {
      flex: 1,
    },
    divider: {
      marginVertical: theme.spacing[4],
    },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    team: {
      flex: 1,
      alignItems: 'center',
    },
    teamLogo: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      marginBottom: theme.spacing[2],
    },
    teamLogoFallback: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing[2],
    },
    teamName: {
      fontWeight: '600',
      textAlign: 'center',
    },
    vs: {
      fontWeight: '700',
      marginHorizontal: theme.spacing[4],
    },
    ctaContainer: {
      marginTop: theme.spacing[4],
    },
    memberBadge: {
      position: 'absolute',
      top: -theme.spacing[2],
      right: -theme.spacing[2],
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.sm,
    },
  });
