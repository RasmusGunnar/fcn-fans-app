// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import type { CommentPreview } from '../../services/likesApi';
import { defaultTheme } from '../../theme';
import type { EventCardVM } from '../../utils/eventCardVM';
import { Avatar } from '../Avatar';
import { contentPaddingX } from '../feed/FeedCardShell';
import { Text } from '../ui';
import { EventSubtypeBadge } from '../ui/EventSubtypeBadge';
import { CardRoot } from './CardRoot';

// ─── Props ───────────────────────────────────────────────────────────────────

interface EventCardProps {
  vm: EventCardVM;
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressShare: () => void;
  onPressDetail: () => void;
  commentPreviews?: CommentPreview[];
  onNewComment?: (comment: CommentPreview) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EventCard({
  vm,
  liked,
  likes,
  comments,
  onToggleLike,
  onPressShare,
  onPressDetail,
  commentPreviews,
  onNewComment,
}: EventCardProps) {
  const { user, isAppAdmin } = useAuth();

  // Defensive guard: vm can be undefined at runtime if caller passes stale props
  // or if toEventCardVM returned null and the guard was bypassed.
  if (!vm) {
    if (__DEV__) console.warn('[EventCard] vm is undefined — skipping render');
    return null;
  }

  return (
    <CardRoot
      targetType={vm.targetType}
      targetId={vm.id}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      onOpenDetail={onPressDetail}
      actions={{
        liked,
        likes,
        comments,
        onToggleLike,
        onPressShare,
      }}
      commentPreviews={commentPreviews}
      onNewComment={onNewComment}
    >
      {/* ── Hero area (full-bleed) with badge overlay ────────────── */}
      <View style={styles.heroOuter}>
        <View style={styles.heroPlaceholder}>
          {/* E1: solid placeholder — heroImageUrl will be used in E2 */}
          <View style={styles.heroOverlay} />
          {/* Badge positioned top-left over hero */}
          <View style={styles.badgeOverlay}>
            <EventSubtypeBadge subtype={vm.badgeType} overlay />
          </View>
        </View>
      </View>

      {/* ── Content section ──────────────────────────────────────── */}

      {/* Title */}
      <Text variant="h3" color="primary" style={styles.title}>
        {vm.title}
      </Text>

      {/* Description */}
      {vm.description ? (
        <Text
          variant="body"
          color="secondary"
          style={styles.description}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {vm.description}
        </Text>
      ) : null}

      {/* Meta lines */}
      {vm.dateText ? (
        <View style={styles.metaRow}>
          <Ionicons
            name="calendar-outline"
            size={theme.components.icon.size.sm}
            color={theme.colors.text.muted}
          />
          <Text variant="body" color="muted" style={styles.metaText}>
            {vm.dateText}
          </Text>
        </View>
      ) : null}

      {vm.locationText ? (
        <View style={styles.metaRow}>
          <Ionicons
            name="location-outline"
            size={theme.components.icon.size.sm}
            color={theme.colors.text.muted}
          />
          <Text variant="body" color="muted" style={styles.metaText}>
            {vm.locationText}
          </Text>
        </View>
      ) : null}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Organizer row */}
      {vm.organizerName ? (
        <View style={styles.organizerRow}>
          <Avatar
            avatarUrl={vm.organizerAvatarUrl}
            size={theme.spacing[7]}
            label={vm.organizerName}
          />
          <View style={styles.organizerInfo}>
            <Text variant="caption" color="muted" style={styles.organizerLabel}>
              Arrangør
            </Text>
            <Text variant="body" color="primary" style={styles.organizerName}>
              {vm.organizerName}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Status line (accent) */}
      {vm.statusLine ? (
        <Text variant="body" color="primary" style={styles.statusLine}>
          {vm.statusLine}
        </Text>
      ) : null}

      {/* CTA button */}
      <Pressable style={styles.ctaButton} onPress={onPressDetail}>
        <Text variant="body" color="inverse" style={styles.ctaText}>
          {vm.ctaLabel}
        </Text>
      </Pressable>
    </CardRoot>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const theme = defaultTheme;

const styles = StyleSheet.create({
  // Hero: full-bleed (negative horizontal margin to escape content padding)
  heroOuter: {
    marginHorizontal: -contentPaddingX,
    marginTop: -theme.spacing[3], // pull up into card top
    marginBottom: theme.spacing[3],
    overflow: 'hidden' as const,
  },
  heroPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.bg.subtle,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay.medium,
  },
  badgeOverlay: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    left: theme.spacing[3],
  },

  // Content
  title: {
    marginBottom: theme.spacing[2],
  },
  description: {
    marginBottom: theme.spacing[3],
  },

  // Meta rows
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  metaText: {
    flex: 1,
  },

  // Divider
  divider: {
    height: theme.layout.borderHairline,
    backgroundColor: theme.colors.border.subtle,
    marginVertical: theme.spacing[3],
    marginHorizontal: -contentPaddingX,
  },

  // Organizer
  organizerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  organizerInfo: {
    flex: 1,
  },
  organizerLabel: {
    marginBottom: theme.spacing[0],
  },
  organizerName: {
    fontWeight: '600',
  },

  // Status
  statusLine: {
    color: theme.colors.primary,
    fontWeight: '600',
    marginBottom: theme.spacing[3],
  },

  // CTA
  ctaButton: {
    width: '100%',
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  ctaText: {
    fontWeight: '600',
    textAlign: 'center' as const,
  },
});
