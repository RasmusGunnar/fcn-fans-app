import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
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
  weeklyScore,
  subtitle,
  onPressProfile,
  onPressReference,
}: WeeklyTopFanCardProps) {
  // Award age affects feed position, never the winner's visual significance.
  return (
    <View testID="weekly-fan-card" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Se ${displayName}s profil · Ugens fan`}
        onPress={onPressProfile}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={styles.avatar}>
          <Avatar avatarUrl={avatarUrl} label={displayName} size={64} />
        </View>
        <View style={styles.identity}>
          <Text style={styles.kicker}>UGENS FAN</Text>
          <Text numberOfLines={2} style={styles.name}>
            {displayName || 'FCN fan'}
          </Text>
        </View>
        <Ionicons name="trophy" size={30} color="#F7D994" />
      </Pressable>
      <Text numberOfLines={2} style={styles.reason}>
        {subtitle?.trim() || 'Tak for engagementet i fællesskabet'}
      </Text>
      {typeof weeklyScore === 'number' ? (
        <Text style={styles.score}>{weeklyScore} point i ugen</Text>
      ) : null}
      {onPressReference ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Se vinderens bidrag"
          onPress={onPressReference}
          style={({ pressed }) => [styles.reference, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.referenceLabel}>Se bidraget →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderTopWidth: 3,
    padding: 18,
    backgroundColor: '#791B35',
    borderColor: '#C49A50',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minHeight: 44 },
  avatar: { borderWidth: 2, borderRadius: 38, padding: 3, borderColor: '#F7D994' },
  identity: { flex: 1, minWidth: 0 },
  kicker: { color: '#F7D994', fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  name: { color: '#fff', fontSize: 22, lineHeight: 27, fontWeight: '800', marginTop: 4 },
  reason: { color: '#FFEAF0', fontSize: 14, lineHeight: 20, marginTop: 14 },
  score: { color: '#f0d99f', fontSize: 12, fontWeight: '600', marginTop: 8 },
  reference: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  referenceLabel: { color: '#F7D994', fontWeight: '700', fontSize: 12 },
});
