// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../ui/Card';
import { CardRoot } from './CardRoot';
import { CardHeader } from './CardHeader';
import { useAuth } from '../../auth/AuthProvider';
import { defaultTheme } from '../../theme';
import { buildCardBehaviorModel } from './cardBehaviorModel';
import type { CommentPreview } from '../../services/likesApi';

interface EventCardProps {
  eventId: string; // Required for comments
  title: string;
  date: string;
  location: string;
  spotsLeft: number;
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressComment: () => void;
  onPressShare: () => void;
  communityName?: string | null; // Community/organizer name if event is linked to community
  communityId?: string | null; // Community/organizer ID
  eventType?: 'event' | 'bustur' | string | null;
  targetType?: 'event' | 'bus_trip';
  commentPreviews?: CommentPreview[];
  onNewComment?: (comment: CommentPreview) => void;
}

export function EventCard({
  eventId,
  title,
  date,
  location,
  spotsLeft,
  liked,
  likes,
  comments,
  onToggleLike,
  onPressComment,
  onPressShare,
  communityName,
  communityId,
  eventType,
  targetType = 'event',
  commentPreviews,
  onNewComment,
}: EventCardProps) {
  const { user, isAppAdmin } = useAuth();
  const navigation = useNavigation();
  const theme = defaultTheme;
  const normalizedEventType = (eventType ?? targetType ?? '').toString().toLowerCase();
  const categoryKey = normalizedEventType === 'bustur' || normalizedEventType === 'bus_trip'
    ? 'bus_trip'
    : 'event';

  // Build card behavior model
  const cardModel = buildCardBehaviorModel({
    kind: 'event',
    actorType: communityId ? 'community' : 'fan',
    actorName: communityName || 'Event',
    eventId: eventId,
    eventType: eventType ?? undefined,
    eventCommunityName: communityName || null,
  });

  const handleOpenDetail = () => {
    if (cardModel.pressBehavior === 'open_internal' && cardModel.internalEventId) {
      (navigation as any).navigate('EventDetails', { eventId: cardModel.internalEventId });
    }
  };

  return (
    <CardRoot
      targetType={targetType}
      targetId={eventId}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      onOpenDetail={cardModel.pressBehavior === 'open_internal' ? handleOpenDetail : undefined}
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
      <CardHeader
        categoryKey={categoryKey}
        nameLine={cardModel.nameLine}
        subtitle={null}
        avatarSlot={
          <View style={styles.communityAvatar}>
            <Ionicons name="people" size={20} color={theme.colors.bg.card} />
          </View>
        }
      />
      <Text style={styles.title}>{title}</Text>
      <View style={styles.detailRow}>
        <Ionicons name="calendar" size={16} color={theme.colors.text.secondary} />
        <Text style={styles.detailText}>{date}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="location" size={16} color={theme.colors.text.secondary} />
        <Text style={styles.detailText}>{location}</Text>
      </View>
      <Text style={styles.spotsLeft}>{spotsLeft} pladser tilbage</Text>
    </CardRoot>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  communityAvatar: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing[2],
  },
  spotsLeft: {
    fontSize: 14,
    color: theme.colors.pill.orange.text,
    fontWeight: '600',
    marginBottom: theme.spacing[6],
  },
});
