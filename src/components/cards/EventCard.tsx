// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Button, Text } from '../ui';
import { CardRoot } from './CardRoot';
import { CardHeader } from './CardHeader';
import { useAuth } from '../../auth/AuthProvider';
import { defaultTheme } from '../../theme';
import { buildCardBehaviorModel } from './cardBehaviorModel';
import { CardMedia } from './CardMedia';
import { matchProvider } from '../../services/matches';
import type { Match } from '../../services/matches/MatchProvider';
import type { CommentPreview } from '../../services/likesApi';
import type { CategoryKey } from '../../theme/categories';
import type { ProfileMap } from '../../utils/actor';
import { resolveActorLine } from '../../utils/actor';
import { EventSubtypeBadge, type EventSubtype } from '../ui/EventSubtypeBadge';
import { formatEventDate } from '../../services/profileApi';
import { Avatar } from '../Avatar';

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
  onPressDetail?: () => void;
  communityName?: string | null; // Community/organizer name if event is linked to community
  communityId?: string | null; // Community/organizer ID
  organizerType?: 'fan' | 'community' | string | null;
  organizerId?: string | null;
  eventType?: 'event' | 'bustur' | string | null;
  matchId?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  targetType?: 'event' | 'bus_trip';
  categoryKey?: CategoryKey;
  profileMap?: ProfileMap;
  communityMap?: Record<string, string>;
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
  onPressDetail,
  communityName,
  communityId,
  organizerType,
  organizerId,
  eventType,
  matchId,
  imageUrl,
  description,
  targetType = 'event',
  categoryKey,
  profileMap,
  communityMap,
  commentPreviews,
  onNewComment,
}: EventCardProps) {
  const { user, isAppAdmin } = useAuth();
  const navigation = useNavigation();
  const theme = defaultTheme;
  const [matchData, setMatchData] = useState<Match | null>(null);
  const normalizedEventType = (eventType ?? targetType ?? '').toString().toLowerCase();
  const isEventSubtype = normalizedEventType === 'event';
  const isMatchCard = Boolean(matchId);
  const resolvedSubtype: EventSubtype = isMatchCard
    ? 'match'
    : normalizedEventType === 'bustur' || normalizedEventType === 'bus_trip'
      ? 'bus_trip'
      : 'event';
  const resolvedOrganizerType =
    organizerType ?? (communityId ? 'community' : 'fan');
  const resolvedOrganizerId =
    organizerId ?? (resolvedOrganizerType === 'community' ? communityId ?? null : null);
  const resolvedCommunityName =
    (resolvedOrganizerType === 'community' && resolvedOrganizerId
      ? communityMap?.[resolvedOrganizerId]
      : null) ?? communityName ?? null;

  if (__DEV__ && (!resolvedOrganizerType || !resolvedOrganizerId)) {
    console.warn('[EventCard] Missing organizer data', {
      eventId,
      organizerType: resolvedOrganizerType,
      organizerId: resolvedOrganizerId,
    });
  }
  const resolvedCategoryKey =
    categoryKey ??
    (isMatchCard
      ? 'match'
      : normalizedEventType === 'bustur' || normalizedEventType === 'bus_trip'
        ? 'bus_trip'
        : 'event');

  useEffect(() => {
    let isActive = true;
    if (!matchId) {
      setMatchData(null);
      return undefined;
    }
    matchProvider.getMatchById(matchId).then((data) => {
      if (isActive) {
        setMatchData(data);
      }
    });
    return () => {
      isActive = false;
    };
  }, [matchId]);

  // Build card behavior model
  const cardModel = buildCardBehaviorModel({
    kind: 'event',
    actorType: resolvedOrganizerType === 'community' ? 'community' : 'fan',
    actorName: resolvedCommunityName || 'Event',
    eventId: eventId,
    eventType: eventType ?? undefined,
    eventCommunityName: resolvedCommunityName || null,
  });

  const handleOpenDetail = () => {
    if (onPressDetail) {
      onPressDetail();
      return;
    }
    if (cardModel.pressBehavior === 'open_internal' && cardModel.internalEventId) {
      (navigation as any).navigate('EventDetails', { eventId: cardModel.internalEventId });
    }
  };

  const resolvedKickoff = matchData?.kickoff ?? date;
  const resolvedVenue = matchData?.venueName ?? location;
  const resolvedHome = matchData?.homeTeamName;
  const resolvedAway = matchData?.awayTeamName;
  const formattedKickoff = resolvedKickoff
    ? new Date(resolvedKickoff).toLocaleString('da-DK', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const formattedEventDate = date ? formatEventDate(date) : '';
  const eventDateDisplay =
    formattedEventDate || (date && !date.includes('T') ? date : '');

  const resolvedActor = resolveActorLine({
    actorType: resolvedOrganizerType === 'community' ? 'community' : 'user',
    authorId: resolvedOrganizerType === 'fan' ? resolvedOrganizerId ?? undefined : undefined,
    authorEmail: resolvedOrganizerType === 'fan' ? undefined : resolvedCommunityName,
    profileMap,
    communityName: resolvedCommunityName,
  });

  return (
    <CardRoot
      targetType={targetType}
      targetId={eventId}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      profileMap={profileMap}
      categoryKey={resolvedCategoryKey}
      badgeSlot={<EventSubtypeBadge subtype={resolvedSubtype} />}
      onOpenDetail={
        onPressDetail
          ? handleOpenDetail
          : cardModel.pressBehavior === 'open_internal'
            ? handleOpenDetail
            : undefined
      }
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
        nameLine={resolvedActor.displayName}
        subtitle={eventDateDisplay || undefined}
        avatarSlot={
          <Avatar
            userId={resolvedOrganizerType === 'fan' ? resolvedOrganizerId ?? undefined : undefined}
            avatarUrl={resolvedActor.avatarUrl}
            size={40}
            label={resolvedActor.displayName}
          />
        }
      />
      {isMatchCard ? (
        matchData ? (
          <>
            <View style={styles.matchRow}>
              <View style={styles.team}>
                <View style={styles.teamCircle}>
                  <Text variant="caption" color="inverse" style={styles.teamInitials}>
                    {resolvedHome?.substring(0, 3).toUpperCase()}
                  </Text>
                </View>
                <Text variant="caption" color="primary" style={styles.teamName} numberOfLines={2}>
                  {resolvedHome}
                </Text>
              </View>
              <Text variant="bodyBold" color="primary" style={styles.vs}>
                VS
              </Text>
              <View style={styles.team}>
                <View style={styles.teamCircle}>
                  <Text variant="caption" color="inverse" style={styles.teamInitials}>
                    {resolvedAway?.substring(0, 3).toUpperCase()}
                  </Text>
                </View>
                <Text variant="caption" color="primary" style={styles.teamName} numberOfLines={2}>
                  {resolvedAway}
                </Text>
              </View>
            </View>
            {formattedKickoff ? (
              <View style={styles.detailRow}>
                <Ionicons name="calendar" size={16} color={theme.colors.text.secondary} />
                <Text variant="body" color="secondary" style={styles.detailText}>
                  {formattedKickoff}
                </Text>
              </View>
            ) : null}
            {resolvedVenue ? (
              <View style={styles.detailRow}>
                <Ionicons name="location" size={16} color={theme.colors.text.secondary} />
                <Text variant="body" color="secondary" style={styles.detailText}>
                  {resolvedVenue}
                </Text>
              </View>
            ) : null}
            <Button title="Se detaljer" onPress={handleOpenDetail} size="sm" />
          </>
        ) : (
          <>
            <Text variant="body" color="secondary" style={styles.loadingText}>
              Kampdata indlæses…
            </Text>
            {formattedKickoff ? (
              <View style={styles.detailRow}>
                <Ionicons name="calendar" size={16} color={theme.colors.text.secondary} />
                <Text variant="body" color="secondary" style={styles.detailText}>
                  {formattedKickoff}
                </Text>
              </View>
            ) : null}
            <Button title="Se detaljer" onPress={handleOpenDetail} size="sm" />
          </>
        )
      ) : isEventSubtype ? (
        <>
          <View style={styles.eventContent}>
            <Text variant="body" color="primary" style={styles.eventTitle}>
              {title}
            </Text>
            {eventDateDisplay ? (
              <View style={styles.eventMetaRow}>
                <Ionicons name="calendar-outline" size={14} color={theme.colors.text.muted} />
                <Text variant="body" color="muted" style={styles.eventMetaText}>
                  {eventDateDisplay}
                </Text>
              </View>
            ) : null}
            <View style={styles.eventMetaRow}>
              <Ionicons name="location-outline" size={14} color={theme.colors.text.muted} />
              <Text variant="body" color="muted" style={styles.eventMetaText}>
                {location}
              </Text>
            </View>
            {description ? (
              <Text
                variant="body"
                color="primary"
                style={styles.eventDescription}
                numberOfLines={3}
                ellipsizeMode="tail"
              >
                {description}
              </Text>
            ) : null}
          </View>

          {imageUrl ? (
            <CardMedia aspectRatio={4 / 3}>
              <Image source={{ uri: imageUrl }} style={styles.eventImage} resizeMode="cover" />
            </CardMedia>
          ) : null}

          <View style={styles.ctaSection}>
            <Pressable style={styles.ctaButton} onPress={handleOpenDetail}>
              <Text variant="body" color="primary" style={styles.ctaText}>
                Se detaljer
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text variant="h3" color="primary" style={styles.title}>
            {title}
          </Text>
          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={16} color={theme.colors.text.secondary} />
            <Text variant="body" color="secondary" style={styles.detailText}>
              {date}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color={theme.colors.text.secondary} />
            <Text variant="body" color="secondary" style={styles.detailText}>
              {location}
            </Text>
          </View>
          <Text variant="caption" style={styles.spotsLeft}>
            {spotsLeft} pladser tilbage
          </Text>
        </>
      )}
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
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[4],
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  teamCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitials: {
  },
  teamName: {
    marginTop: theme.spacing[1],
    textAlign: 'center',
  },
  vs: {
    marginHorizontal: theme.spacing[3],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  detailText: {
    marginLeft: theme.spacing[2],
  },
  spotsLeft: {
    color: theme.colors.pill.orange.text,
    marginBottom: theme.spacing[6],
  },
  loadingText: {
    marginBottom: theme.spacing[2],
  },
  eventContent: {
    paddingHorizontal: theme.spacing[0],
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing[2],
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    marginBottom: theme.spacing[2],
  },
  eventMetaText: {
    fontSize: 14,
    lineHeight: 21,
  },
  eventDescription: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: theme.spacing[2] - theme.spacing[1] / 2,
  },
  eventImage: {
    width: '100%',
    height: '100%',
  },
  ctaSection: {
    paddingVertical: theme.spacing[3],
  },
  ctaButton: {
    width: '100%',
    paddingVertical: theme.spacing[2] + theme.spacing[1] / 2,
    backgroundColor: theme.colors.badges.event,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
  },
  ctaText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
