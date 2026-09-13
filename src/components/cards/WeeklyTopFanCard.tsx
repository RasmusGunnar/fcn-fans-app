import React, { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
import { useTheme } from '../../theme';
import { weeklyFanPhase } from '../../utils/fanExperience';
import type { FanLevelKey } from '../../types/fan';

export type WeeklyTopFanCardProps = {
  avatarUrl?: string | null;
  displayName: string;
  fanLevelKey: FanLevelKey;
  weekStartDate?: string;
  awardedAt?: string | null;
  weeklyScore?: number;
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

export function WeeklyTopFanCard({
  avatarUrl,
  displayName,
  awardedAt,
  weeklyScore,
  subtitle,
  onPressProfile,
  onPressReference,
}: WeeklyTopFanCardProps) {
  const theme = useTheme();
  const [phase, setPhase] = useState(() => weeklyFanPhase(awardedAt));
  useEffect(() => {
    const update = () => {
      if (AppState.currentState === 'active') setPhase(weeklyFanPhase(awardedAt));
    };
    const timer = setInterval(update, 60_000);
    const listener = AppState.addEventListener('change', update);
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [awardedAt]);
  const fresh = phase === 'fresh';
  const ink = fresh ? '#fff' : theme.colors.text.primary;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: fresh ? '#38141e' : theme.colors.bg.card,
          borderColor: theme.colors.primary + '25',
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Se ${displayName}s profil · Ugens fan`}
        onPress={onPressProfile}
        style={styles.row}
      >
        <View style={styles.avatar}>
          <Avatar avatarUrl={avatarUrl} label={displayName} size={44} />
        </View>
        <View style={styles.identity}>
          <Text style={[styles.kicker, { color: fresh ? '#f0d99f' : theme.colors.primary }]}>
            UGENS FAN
          </Text>
          <Text numberOfLines={2} style={[styles.name, { color: ink }]}>
            {displayName || 'FCN fan'}
          </Text>
        </View>
        <Ionicons name="trophy-outline" size={26} color="#c2a15c" />
      </Pressable>
      {fresh ? (
        <Text numberOfLines={2} style={[styles.reason, { color: '#ffffffcc' }]}>
          {subtitle?.trim() || 'Et stærkt bidrag til fællesskabet'}
        </Text>
      ) : null}
      {fresh && typeof weeklyScore === 'number' ? (
        <Text style={styles.score}>{weeklyScore} point i ugen · tak for engagementet</Text>
      ) : null}
      {onPressReference ? (
        <Pressable accessibilityRole="button" onPress={onPressReference} style={styles.reference}>
          <Text
            style={{
              color: fresh ? '#f0d99f' : theme.colors.primary,
              fontWeight: '700',
              fontSize: 12,
            }}
          >
            Se bidraget →
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { borderWidth: 2, borderColor: '#c2a15c', borderRadius: 25, padding: 1 },
  identity: { flex: 1 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  name: { fontSize: 17, fontWeight: '800', marginTop: 4 },
  reason: { fontSize: 14, lineHeight: 20, marginTop: 12 },
  score: { color: '#f0d99f', fontSize: 12, fontWeight: '600', marginTop: 8 },
  reference: { paddingTop: 10, paddingBottom: 2, alignSelf: 'flex-start' },
});
