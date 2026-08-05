// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import type { CommentPreview } from '../../services/likesApi';
import { defaultTheme } from '../../theme';
import type { EventCardVM } from '../../utils/eventCardVM';
import { cleanText } from '../../utils/text';
import { Avatar } from '../Avatar';
import { contentPaddingX } from '../feed/FeedCardShell';
import { AttendanceBubbles } from '../social/AttendanceBubbles';
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
  onPressShare?: () => void;
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

  // Defensive guard — should never happen if callers use toEventCardVM
  if (!vm) return null;

  const isMatch = vm.kind === 'match';
  const detailTypeLabel = isMatch ? 'kampen' : vm.kind === 'bus_trip' ? 'busturen' : 'eventet';
  const hasLogos = isMatch && (vm.homeLogo || vm.awayLogo);
  const cleanedTitle = cleanText(vm.title);
  const cleanedDescription = cleanText(vm.description);
  const cleanedDateText = cleanText(vm.dateText);
  const cleanedLocationText = cleanText(vm.locationText);
  const cleanedOrganizerName = cleanText(vm.organizerName);
  const cleanedStatusLine = cleanText(vm.statusLine);
  const cleanedCtaLabel = cleanText(vm.ctaLabel) || 'Se detaljer';

  return (
    <CardRoot
      targetType={vm.targetType}
      targetId={vm.id}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      onOpenDetail={onPressDetail}
      openDetailAccessibilityLabel={`Åbn ${detailTypeLabel} ${cleanedTitle}`}
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
          {vm.heroImageUrl ? (
            <Image source={{ uri: vm.heroImageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : isMatch ? (
            <View style={styles.heroFallbackMatch} />
          ) : (
            <View style={styles.heroOverlay} />
          )}

          {/* Semi-transparent dark overlay (always on for match) */}
          {(vm.heroImageUrl || isMatch) && <View style={styles.heroDarkOverlay} />}

          {/* Badge positioned top-left over hero */}
          <View style={styles.badgeOverlay}>
            <EventSubtypeBadge subtype={vm.badgeType} overlay />
          </View>

          {/* "Deltager" badge - top-right if user is going */}
          {vm.isGoing && (
            <View style={styles.attendingBadgeOverlay}>
              <View style={styles.attendingBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.text.inverse}
                />
                <Text variant="caption" color="inverse" style={styles.attendingBadgeText}>
                  Deltager
                </Text>
              </View>
            </View>
          )}

          {/* H2H logos + VS inside the hero area */}
          {hasLogos ? (
            <View style={styles.h2hOverlay}>
              <View style={styles.h2hBadge}>
                {vm.homeLogo ? (
                  <Image
                    source={{ uri: vm.homeLogo }}
                    style={styles.h2hLogoImg}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
              <Text variant="h2" color="inverse" style={styles.h2hVs}>
                VS
              </Text>
              <View style={styles.h2hBadge}>
                {vm.awayLogo ? (
                  <Image
                    source={{ uri: vm.awayLogo }}
                    style={styles.h2hLogoImg}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Content section ──────────────────────────────────────── */}

      {/* Title */}
      <Text variant="h3" color="primary" style={styles.title}>
        {cleanedTitle}
      </Text>

      {/* Description */}
      {cleanedDescription ? (
        <Text
          variant="body"
          color="secondary"
          style={styles.description}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {cleanedDescription}
        </Text>
      ) : null}

      {/* Meta lines */}
      {cleanedDateText ? (
        <View style={styles.metaRow}>
          <Ionicons
            name="calendar-outline"
            size={theme.components.icon.size.sm}
            color={theme.colors.text.muted}
          />
          <Text variant="body" color="muted" style={styles.metaText}>
            {cleanedDateText}
          </Text>
        </View>
      ) : null}

      {cleanedLocationText ? (
        <View style={styles.metaRow}>
          <Ionicons
            name="location-outline"
            size={theme.components.icon.size.sm}
            color={theme.colors.text.muted}
          />
          <Text variant="body" color="muted" style={styles.metaText}>
            {cleanedLocationText}
          </Text>
        </View>
      ) : null}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Organizer row */}
      {cleanedOrganizerName ? (
        <View style={styles.organizerRow}>
          <Avatar
            avatarUrl={vm.organizerAvatarUrl}
            size={theme.spacing[7]}
            label={cleanedOrganizerName}
          />
          <View style={styles.organizerInfo}>
            <Text variant="caption" color="muted" style={styles.organizerLabel}>
              Arrangør
            </Text>
            <Text variant="body" color="primary" style={styles.organizerName}>
              {cleanedOrganizerName}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Attendance info */}
      {vm.attendeeCount !== undefined && vm.attendeeCount > 0 && (
        <View style={styles.attendanceRow}>
          <AttendanceBubbles
            avatars={vm.attendeeAvatars || []}
            count={vm.attendeeCount}
            max={5}
            size={theme.spacing[6]}
            textVariant="body"
          />
        </View>
      )}

      {/* Status line (accent) */}
      {cleanedStatusLine ? (
        <Text variant="body" color="primary" style={styles.statusLine}>
          {cleanedStatusLine}
        </Text>
      ) : null}

      {/* CTA button */}
      <Pressable
        style={styles.ctaButton}
        onPress={(event) => {
          event.stopPropagation();
          onPressDetail();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${cleanedCtaLabel}: ${cleanedTitle}`}
      >
        <Text variant="body" color="inverse" style={styles.ctaText}>
          {cleanedCtaLabel}
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
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallbackMatch: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.primary,
    opacity: 0.85,
  },
  heroDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay.heroScrim,
  },
  badgeOverlay: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    left: theme.spacing[3],
  },
  attendingBadgeOverlay: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
  },
  attendingBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.brand.accent,
    borderRadius: theme.radius.md,
  },
  attendingBadgeText: {
    fontWeight: '600',
  },

  // Head-to-head overlay (positioned centred inside hero)
  h2hOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[4],
  },
  h2hBadge: {
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
    backgroundColor: 'transparent',
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  h2hLogoImg: {
    width: theme.spacing[12],
    height: theme.spacing[12],
  },
  h2hVs: {
    fontWeight: '700',
    textShadowColor: theme.colors.overlay.textShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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

  // Attendance
  attendanceRow: {
    marginBottom: theme.spacing[3],
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
