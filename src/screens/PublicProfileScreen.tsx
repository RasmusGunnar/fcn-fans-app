// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via useTheme / defaultTheme.
// All spacing, colors, and radius values must use theme tokens.
// NO hardcoded numbers or color strings allowed.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { FanPostCard } from '../components/cards/FanPostCard';
import { FanBarometerCompactCard } from '../components/fan/FanBarometerCompactCard';
import { FanLevelBadge } from '../components/fan/FanLevelBadge';
import { AppHeader } from '../components/AppHeader';
import { OutlineButton } from '../components/ui/OutlineButton';
import { Text } from '../components/ui';
import { getSafeFanLevelKey } from '../lib/fanLevel';
import { getFanLevelDescription } from '../lib/fanbarometer';
import { fetchUserCommentedPostIds } from '../services/commentsApi';
import { fetchPublicProfileById } from '../services/profileApi';
import {
  createOrGetDirectConversation,
  getDirectMessageBlockStatus,
} from '../services/messagesApi';
import { navigateToDirectMessageConversation } from '../navigation/navigationRef';
import { confirmAndSubmitReport } from '../services/reporting';
import { useFeed } from '../state/FeedContext';
import { useTheme, type Theme } from '../theme';
import { targetKey } from '../utils/targetKey';

type FeedPost = ReturnType<typeof useFeed>['posts'][number];

export default function PublicProfileScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const route = useRoute() as any;
  const userId: string | undefined = route?.params?.userId;
  const { user, isAppAdmin } = useAuth();
  const {
    posts,
    profileMap,
    communityMap,
    likeMap,
    commentCountMap,
    commentPreviewMap,
    toggleLike,
    incrementCommentCount,
    addCommentPreview,
    removePost,
  } = useFeed();

  const [resolvedProfile, setResolvedProfile] = useState<Awaited<
    ReturnType<typeof fetchPublicProfileById>
  > | null>(null);
  const [messageBlocked, setMessageBlocked] = useState(true);
  const [messageAccessLoading, setMessageAccessLoading] = useState(false);
  const [openingConversation, setOpeningConversation] = useState(false);

  useEffect(() => {
    if (!userId) {
      setResolvedProfile(null);
      return;
    }

    let cancelled = false;
    fetchPublicProfileById(userId).then((profile) => {
      if (!cancelled) {
        setResolvedProfile(profile);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!user?.id || !userId || user.id === userId) {
      setMessageBlocked(true);
      setMessageAccessLoading(false);
      return;
    }

    let cancelled = false;
    setMessageAccessLoading(true);
    void getDirectMessageBlockStatus(userId)
      .then((blocked) => {
        if (!cancelled) setMessageBlocked(blocked);
      })
      .finally(() => {
        if (!cancelled) setMessageAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, userId]);

  const authorProfile = userId ? profileMap?.[userId] : undefined;
  const effectiveAuthorProfile = resolvedProfile ?? authorProfile;
  const effectiveProfileMap = useMemo(() => {
    if (!userId || !resolvedProfile) {
      return profileMap;
    }

    return {
      ...profileMap,
      [userId]: {
        ...(profileMap?.[userId] ?? {}),
        display_name: resolvedProfile.display_name,
        username: resolvedProfile.username,
        avatar_url: resolvedProfile.avatar_url,
        fan_level_key: resolvedProfile.fan_level_key,
      },
    };
  }, [profileMap, resolvedProfile, userId]);
  const displayName = effectiveAuthorProfile?.display_name || 'Fan';
  const avatarUrl = effectiveAuthorProfile?.avatar_url || null;
  const fanLevel = getSafeFanLevelKey(effectiveAuthorProfile?.fan_level_key);
  const levelDescription = getFanLevelDescription(fanLevel);
  const canReportUser = Boolean(user?.id && userId && user.id !== userId);

  // ---------- user's own posts ----------
  const userPosts = useMemo(() => {
    if (!userId || !Array.isArray(posts)) return [];
    try {
      return posts.filter(
        (p) =>
          p && typeof p === 'object' && (p.authorId === userId || (p as any).author_id === userId),
      );
    } catch {
      return [];
    }
  }, [posts, userId]);

  // ---------- posts the user commented on ----------
  const [commentedPostIds, setCommentedPostIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchUserCommentedPostIds(userId).then((ids) => {
      if (!cancelled) setCommentedPostIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Filter to posts available in cache, excluding user's own posts
  const commentedPosts = useMemo(() => {
    if (!commentedPostIds.length || !Array.isArray(posts)) return [];
    const ownIds = new Set(userPosts.map((p) => p.id));
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const result: FeedPost[] = [];
    for (const id of commentedPostIds) {
      if (ownIds.has(id)) continue; // skip own posts
      const post = postMap.get(id);
      if (post) result.push(post);
    }
    return result;
  }, [commentedPostIds, posts, userPosts]);

  // Total unique commented-on count (from DB, not limited to cache)
  const commentedOnCount = commentedPostIds.filter(
    (id) => !userPosts.some((p) => p.id === id),
  ).length;

  // ---------- combined data for SectionList-like FlatList ----------
  type SectionItem =
    | { type: 'sectionHeader'; title: string; key: string }
    | { type: 'post'; data: FeedPost; key: string }
    | { type: 'empty'; message: string; key: string };

  const listData = useMemo<SectionItem[]>(() => {
    const items: SectionItem[] = [];

    // Section 1: own posts
    items.push({ type: 'sectionHeader', title: 'Opslag', key: 'sec-own' });
    if (userPosts.length > 0) {
      userPosts.forEach((p) => items.push({ type: 'post', data: p, key: `own-${p.id}` }));
    } else {
      items.push({ type: 'empty', message: 'Ingen opslag endnu', key: 'empty-own' });
    }

    // Section 2: commented-on posts
    items.push({ type: 'sectionHeader', title: 'Kommenteret på', key: 'sec-commented' });
    if (commentedPosts.length > 0) {
      commentedPosts.forEach((p) =>
        items.push({ type: 'post', data: p, key: `commented-${p.id}` }),
      );
    } else {
      items.push({
        type: 'empty',
        message: 'Ingen kommenterede opslag',
        key: 'empty-commented',
      });
    }

    return items;
  }, [userPosts, commentedPosts]);

  const renderCard = useCallback(
    (post: FeedPost) => {
      const profile = post.authorId ? effectiveProfileMap?.[post.authorId] : undefined;
      const key = targetKey('post', post.id);
      const likeState = likeMap[key] || { liked: false, likes: 0 };
      const commentCount = commentCountMap[key] || 0;
      const previews = commentPreviewMap[key] || [];
      return (
        <View style={styles.cardWrap}>
          <FanPostCard
            post={post}
            authorProfile={profile}
            communityMap={communityMap}
            profileMap={effectiveProfileMap}
            currentUserId={user?.id}
            currentIsAppAdmin={isAppAdmin}
            liked={likeState.liked}
            likes={likeState.likes}
            commentsCount={commentCount}
            commentPreviews={previews}
            onToggleLike={() => {
              if (user?.id) toggleLike('post', post.id, user.id);
            }}
            onDeleted={(postId) => removePost(postId)}
            onNewComment={(comment) => {
              incrementCommentCount('post', post.id);
              addCommentPreview('post', post.id, comment);
            }}
          />
        </View>
      );
    },
    [
      effectiveProfileMap,
      isAppAdmin,
      communityMap,
      likeMap,
      commentCountMap,
      commentPreviewMap,
      toggleLike,
      removePost,
      incrementCommentCount,
      addCommentPreview,
      user,
      styles.cardWrap,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: SectionItem }) => {
      if (item.type === 'sectionHeader') {
        return (
          <Text variant="h3" color="primary" style={styles.sectionTitle}>
            {item.title}
          </Text>
        );
      }
      if (item.type === 'empty') {
        return (
          <View style={styles.emptyState}>
            <Text variant="body" color="secondary">
              {item.message}
            </Text>
          </View>
        );
      }
      return renderCard(item.data);
    },
    [renderCard, styles],
  );

  const handleReportUser = useCallback(() => {
    confirmAndSubmitReport({
      reporterUserId: user?.id,
      targetType: 'user',
      targetId: userId,
      subjectLabel: 'bruger',
    });
  }, [user?.id, userId]);

  const handleStartConversation = useCallback(async () => {
    if (!userId || openingConversation || messageBlocked) return;
    setOpeningConversation(true);
    try {
      const conversationId = await createOrGetDirectConversation(userId);
      navigateToDirectMessageConversation(conversationId);
    } catch (error) {
      Alert.alert(
        'Samtalen kunne ikke åbnes',
        error instanceof Error ? error.message : 'Prøv igen.',
      );
    } finally {
      setOpeningConversation(false);
    }
  }, [messageBlocked, openingConversation, userId]);

  const ListHeader = (
    <View style={styles.headerCard}>
      <Avatar userId={userId} avatarUrl={avatarUrl} size={80} label={displayName} />
      <Text variant="h2" color="primary" style={styles.displayName}>
        {displayName}
      </Text>
      <Text variant="body" color="secondary" style={styles.statsLine}>
        {userPosts.length} opslag · {commentedOnCount} kommentarer
      </Text>
      <View style={styles.badgeWrap}>
        <FanLevelBadge level={fanLevel} size="md" />
        <Text variant="small" color="secondary" style={styles.badgeDescription}>
          {levelDescription}
        </Text>
      </View>
      <FanBarometerCompactCard level={fanLevel} state="ready" />
      {canReportUser && !messageAccessLoading && !messageBlocked ? (
        <View style={styles.reportButtonWrap}>
          <OutlineButton
            title={openingConversation ? 'Åbner...' : 'Send besked'}
            onPress={() => void handleStartConversation()}
            disabled={openingConversation}
          />
        </View>
      ) : null}
      {canReportUser ? (
        <View style={styles.reportButtonWrap}>
          <OutlineButton title="Rapportér bruger" onPress={handleReportUser} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader title="Profil" subtitle="" showProfileButton={false} />
      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    list: {
      paddingHorizontal: theme.spacing[4],
      paddingBottom: theme.spacing[6],
    },
    headerCard: {
      alignItems: 'center',
      paddingVertical: theme.spacing[6],
      gap: theme.spacing[3],
    },
    displayName: {
      textAlign: 'center',
    },
    statsLine: {
      textAlign: 'center',
      marginTop: theme.spacing[1],
    },
    badgeWrap: {
      alignItems: 'center',
      marginTop: theme.spacing[2],
    },
    badgeDescription: {
      marginTop: theme.spacing[1],
      textAlign: 'center',
      maxWidth: '82%',
    },
    reportButtonWrap: {
      marginTop: theme.spacing[2],
      width: '100%',
    },
    sectionTitle: {
      marginTop: theme.spacing[4],
      marginBottom: theme.spacing[3],
    },
    cardWrap: {
      marginBottom: theme.spacing[3],
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: theme.spacing[8],
    },
  });
}
