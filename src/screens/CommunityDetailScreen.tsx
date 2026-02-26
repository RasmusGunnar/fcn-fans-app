import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/ui';
import { Post } from '../types/post';
import { useTheme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { useFeed } from '../state/FeedContext';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import { getFeedItemKey } from '../types/feed';
import {
  getCommunity,
  getMembership,
  joinCommunity,
  leaveCommunity,
  listMembers,
  setMemberRole,
  uploadCommunityAvatar,
  updateCommunity,
  getMemberCount,
  CommunityMember,
  Community as CommunityData,
} from '../services/communities';
import { supabase } from '../lib/supabase';
import { fetchUpcomingFixtures, Fixture, formatDateDa } from '../services/fixtures';
import { fetchEventsUpcoming, Event as CommunityEvent } from '../services/eventsApi';
import { PostComposer } from '../components/PostComposer';
import { pickFromLibrary, pickCameraPhoto } from '../lib/mediaPicker';

type CommunityDetailRouteProp = RouteProp<
  { CommunityDetail: { id: string; title: string } },
  'CommunityDetail'
>;

export default function CommunityDetailScreen() {
  console.log('🚀 DEBUG: CommunityDetailScreen LOADED (v2)');

  const navigation = useNavigation();
  const route = useRoute<CommunityDetailRouteProp>();
  const { id } = route.params || {};
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const USE_UNIFIED_COMMUNITY_FEED = true;
  const { user, isAppAdmin } = useAuth();
  const {
    feedItems,
    profileMap,
    communityMap,
    likeMap,
    commentCountMap,
    commentPreviewMap,
    toggleLike,
    removePost,
    removeNews,
    incrementCommentCount,
    addCommentPreview,
  } = useFeed();

  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [membership, setMembership] = useState<any>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showEditSheet, setShowEditSheet] = useState(false);

  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [postLikes, setPostLikes] = useState<Record<string, boolean>>({});

  const safeFeedItems = (Array.isArray(feedItems) ? feedItems : []).filter(Boolean);
  const safeProfileMap = profileMap || {};
  const safeCommunityMap = communityMap || {};
  const safeLikeMap = likeMap || {};
  const safeCommentCountMap = commentCountMap || {};
  const safeCommentPreviewMap = commentPreviewMap || {};

  const communityFeedItems = safeFeedItems.filter((item) => {
    if (item.kind === 'post') return (item.data as any).communityId === id;
    if (item.kind === 'news')
      return item.data.actorType === 'community' && item.data.actorId === id;
    if (item.kind === 'event' || item.kind === 'bus_trip') return item.data.organizerGroupId === id;
    return false;
  });

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [id]),
  );

  const loadData = async () => {
    setLoading(true);

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);

    // Load community
    const communityData = await getCommunity(id);
    setCommunity(communityData);

    // Load membership
    const membershipData = await getMembership(id);
    setMembership(membershipData);

    // Load member count
    const count = await getMemberCount(id);
    setMemberCount(count);

    // Load members if admin/owner
    if (membershipData && ['owner', 'admin'].includes(membershipData.role)) {
      const membersData = await listMembers(id);
      setMembers(membersData);
    }

    // Load upcoming fixtures (next 3)
    const upcomingFixtures = await fetchUpcomingFixtures(3);
    setFixtures(upcomingFixtures);

    // Load community events using existing service
    const communityEvents = await fetchEventsUpcoming(5, id);
    setEvents(communityEvents);

    setLoading(false);
  };

  const handleJoinLeave = async () => {
    if (!membership) {
      // Join
      setJoining(true);
      const success = await joinCommunity(id);
      setJoining(false);

      if (success) {
        Alert.alert('Succes', 'Du er nu medlem af fællesskabet!');
        loadData();
      } else {
        Alert.alert('Fejl', 'Kunne ikke tilmelde. Prøv igen.');
      }
    } else {
      // Leave
      Alert.alert('Forlad fællesskab', 'Er du sikker på at du vil forlade dette fællesskab?', [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Forlad',
          style: 'destructive',
          onPress: async () => {
            const success = await leaveCommunity(id);
            if (success) {
              Alert.alert('Forladt', 'Du har forladt fællesskabet.');
              loadData();
            } else {
              Alert.alert('Fejl', 'Kunne ikke forlade. Prøv igen.');
            }
          },
        },
      ]);
    }
  };

  const handleToggleRole = async (memberId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    const success = await setMemberRole(id, memberId, newRole);

    if (success) {
      Alert.alert('Succes', `Rolle opdateret til ${newRole === 'admin' ? 'Admin' : 'Medlem'}`);
      loadData();
    } else {
      Alert.alert('Fejl', 'Kunne ikke opdatere rolle. Prøv igen.');
    }
  };

  const handleUploadAvatar = async () => {
    if (!community) return;

    Alert.alert('Upload avatar', 'Vælg kilde', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Bibliotek',
        onPress: async () => {
          const asset = await pickFromLibrary();
          if (asset?.uri) {
            setUploadingAvatar(true);
            const kind = community.type === 'fan_faction' ? 'logo' : 'image';
            const success = await uploadCommunityAvatar(id, asset.uri, kind);
            setUploadingAvatar(false);
            if (success) {
              Alert.alert('Succes', 'Avatar uploadet!');
              loadData();
            }
          }
        },
      },
      {
        text: 'Kamera',
        onPress: async () => {
          const asset = await pickCameraPhoto();
          if (asset?.uri) {
            setUploadingAvatar(true);
            const kind = community.type === 'fan_faction' ? 'logo' : 'image';
            const success = await uploadCommunityAvatar(id, asset.uri, kind);
            setUploadingAvatar(false);
            if (success) {
              Alert.alert('Succes', 'Avatar uploadet!');
              loadData();
            }
          }
        },
      },
    ]);
  };

  const toggleLegacyPostLike = (postId: string) => {
    setPostLikes((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const handleSharePost = () => {
    if (postText.trim()) {
      console.log('Share post:', postText);
      setPostText('');
    }
  };

  const handleStartEdit = () => {
    if (!community) return;
    setEditName(community.name);
    setEditDescription(community.description || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName('');
    setEditDescription('');
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      Alert.alert('Fejl', 'Navn må ikke være tomt');
      return;
    }

    const success = await updateCommunity(id, {
      name: editName,
      description: editDescription || null,
    });

    if (success) {
      Alert.alert('Succes', 'Fællesskab opdateret!');
      setIsEditing(false);
      loadData();
    } else {
      Alert.alert('Fejl', 'Kunne ikke opdatere. Prøv igen.');
    }
  };

  // Owner fallback: if user is owner but no membership record, treat as 'owner' role
  const isOwner = community?.owner_id === currentUserId;
  const effectiveRole = membership?.role ?? (isOwner ? 'owner' : null);
  const canManage = effectiveRole === 'owner' || effectiveRole === 'admin';
  const isMember = !!effectiveRole;

  // Layout constants from contract (P0 spec)
  const LAYOUT = {
    heroHeight: theme.spacing[16] + theme.spacing[8],
    avatarSize: theme.spacing[12],
    avatarOverlap: theme.spacing[6],
    screenPaddingX: theme.spacing[4],
    sectionGap: theme.spacing[6],
  };

  // Accent color based on type
  const accentColor =
    community?.type === 'fan_faction' ? theme.colors.primary : theme.colors.state.info;

  const nextFixture = fixtures[0];

  const styles = makeStyles(theme, accentColor, LAYOUT);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Indlæser...</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!community) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Fællesskab ikke fundet</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Accent Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{community.name}</Text>
        </View>
        <Pressable onPress={() => Alert.alert('Del', 'Delefunktion kommer snart')} style={styles.shareButton}>
          <Ionicons name="share-outline" size={24} color={theme.colors.bg.card} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing[6] }}
      >
        {/* 2. Hero Section - gradient placeholder (no cover_image field exists) */}
        <View style={styles.heroSection} />

        {/* 3. Avatar - centered, overlapping hero */}
        <View style={styles.avatarContainer}>
          <Pressable
            style={styles.avatarWrapper}
            onPress={canManage ? handleUploadAvatar : undefined}
            disabled={uploadingAvatar}
          >
            {community.avatar_url ? (
              <Image source={{ uri: community.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons
                  name={community.type === 'fan_faction' ? 'star' : 'people-circle'}
                  size={LAYOUT.avatarSize * 0.6}
                  color={accentColor}
                />
              </View>
            )}
            {canManage && (
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={16} color={theme.colors.bg.card} />
              </View>
            )}
          </Pressable>
        </View>

        {/* 4. Title */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{community.name}</Text>
            {canManage && (
              <IconButton
                icon="create-outline"
                size="sm"
                variant="ghost"
                color={accentColor}
                onPress={() => setShowEditSheet(true)}
              />
            )}
          </View>
        </View>

        {/* 5. CTA: Primary Button */}
        <View style={styles.ctaContainer}>
          <Pressable
            onPress={handleJoinLeave}
            disabled={joining || !!effectiveRole}
            style={({ pressed }) => [
              styles.ctaButton,
              effectiveRole && styles.ctaButtonDisabled,
              pressed && !effectiveRole && styles.ctaButtonPressed,
            ]}
          >
            <Text style={[styles.ctaButtonText, effectiveRole && styles.ctaButtonTextDisabled]}>
              {joining
                ? 'Tilmelder...'
                : effectiveRole
                  ? effectiveRole === 'member'
                    ? 'Medlem'
                    : 'Ejer'
                  : 'Bliv medlem'}
            </Text>
          </Pressable>
        </View>

        {/* 6. Members Row */}
        <View style={styles.membersRow}>
          <View style={styles.membersLeft}>
            <Ionicons name="people" size={16} color={theme.colors.text.secondary} />
            <Text style={styles.membersText}>
              {memberCount} medlem{memberCount !== 1 ? 'mer' : ''}
            </Text>
          </View>
          {members.length > 0 && (
            <View style={styles.membersAvatars}>
              {members.slice(0, 3).map((member, idx) => (
                <View key={member.id} style={[styles.memberAvatarBubble, { marginLeft: idx > 0 ? -theme.spacing[2] : 0 }]}>
                  {member.avatar_url ? (
                    <Image source={{ uri: member.avatar_url }} style={styles.memberAvatarImage} />
                  ) : (
                    <View style={styles.memberAvatarPlaceholder}>
                      <Ionicons name="person" size={12} color={theme.colors.text.secondary} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          {canManage && (
            <Pressable onPress={() => setShowMembers(!showMembers)}>
              <Text style={styles.seeAllText}>Se alle</Text>
            </Pressable>
          )}
        </View>

        {/* 7. Om Os Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OM OS</Text>
          {!isEditing ? (
            <Text style={styles.aboutText} numberOfLines={4}>
              {community.description || 'Ingen beskrivelse endnu.'}
            </Text>
          ) : (
            <View>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Navn"
                placeholderTextColor={theme.colors.text.secondary}
              />
              <TextInput
                style={[styles.editInput, styles.editInputMultiline]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Beskrivelse"
                placeholderTextColor={theme.colors.text.secondary}
                multiline
                numberOfLines={4}
              />
              <View style={styles.editActions}>
                <Pressable onPress={handleCancelEdit} style={styles.cancelButton}>
                  <Text style={styles.cancelButtonText}>Annuller</Text>
                </Pressable>
                <Pressable onPress={handleSaveEdit} style={[styles.saveButton, { backgroundColor: accentColor }]}>
                  <Text style={styles.saveButtonText}>Gem</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* 8. Kommende Events Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KOMMENDE EVENTS</Text>
          {nextFixture && (
            <Pressable
              style={styles.eventRow}
              onPress={() =>
                (navigation as any).navigate('MatchDetails', { fixtureId: nextFixture.id })
              }
            >
              <View style={styles.eventIcon}>
                <Ionicons name="football" size={20} color={accentColor} />
              </View>
              <View style={styles.eventContent}
              >
                <Text style={styles.eventTitle}>
                  {nextFixture.home_team} vs {nextFixture.away_team}
                </Text>
                <Text style={styles.eventMeta}>{formatDateDa(nextFixture.kickoff_at)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
            </Pressable>
          )}
          {events.length > 0 &&
            events.map((event) => (
              <Pressable
                key={event.id}
                style={styles.eventRow}
                onPress={() => (navigation as any).navigate('EventDetails', { eventId: event.id })}
              >
                <View style={styles.eventIcon}>
                  <Ionicons name="calendar" size={20} color={accentColor} />
                </View>
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>{formatDateDa(event.start_at)}</Text>
                  {event.location_name && (
                    <Text style={styles.eventLocation}>{event.location_name}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
              </Pressable>
            ))}
          {!nextFixture && events.length === 0 && (
            <Text style={styles.emptyText}>Ingen kommende aktiviteter endnu</Text>
          )}
        </View>

        {/* 9. Feed Section */}
        <View style={styles.section}>
          <View style={styles.feedHeader}>
            <Text style={styles.sectionTitle}>FÆLLESSKAB FEED</Text>
            {isMember && (
              <Pressable onPress={() => setShowMembers(!showMembers)}>
                <Text style={styles.newPostLink}>Nyt opslag</Text>
              </Pressable>
            )}
          </View>
          {communityFeedItems.length > 0 ? (
            communityFeedItems.map((item) => {
              const key = getFeedItemKey(item);
              const likeState = safeLikeMap[key] || { liked: false, likes: 0 };
              const commentCount = safeCommentCountMap[key] || 0;
              const commentPreviews = safeCommentPreviewMap[key] || [];

              return (
                <FeedItemRenderer
                  key={key}
                  item={item}
                  itemKey={key}
                  user={user}
                  isAppAdmin={isAppAdmin}
                  likeState={likeState}
                  commentCount={commentCount}
                  commentPreviews={commentPreviews}
                  safeProfileMap={safeProfileMap}
                  communityMap={safeCommunityMap}
                  toggleLike={toggleLike}
                  removePost={removePost}
                  removeNews={removeNews}
                  incrementCommentCount={incrementCommentCount}
                  addCommentPreview={addCommentPreview}
                />
              );
            })
          ) : (
            <Text style={styles.emptyText}>Ingen opslag endnu</Text>
          )}
        </View>

        {/* Composer - Only for members */}
        {isMember && (
          <View style={styles.composerSection}>
            <PostComposer
              onSuccess={() => {
                console.log('[CommunityDetail] Post created successfully');
                loadData();
              }}
            />
          </View>
        )}

      </ScrollView>

      {canManage && (
        <Modal
          visible={showEditSheet}
          animationType="slide"
          transparent
          onRequestClose={() => setShowEditSheet(false)}
        >
          <View style={styles.editSheetOverlay}>
            <Pressable style={styles.editSheetBackdrop} onPress={() => setShowEditSheet(false)} />
            <View style={styles.editSheet}>
              <Text style={styles.editSheetTitle}>Redigér</Text>
              <Pressable
                style={styles.editSheetAction}
                onPress={() => {
                  setShowEditSheet(false);
                  handleStartEdit();
                }}
              >
                <Ionicons name="create-outline" size={20} color={accentColor} />
                <Text style={styles.editSheetActionText}>Redigér tekst</Text>
              </Pressable>
              <Pressable
                style={styles.editSheetAction}
                onPress={() => {
                  setShowEditSheet(false);
                  handleUploadAvatar();
                }}
              >
                <Ionicons name="image-outline" size={20} color={accentColor} />
                <Text style={styles.editSheetActionText}>Skift avatar</Text>
              </Pressable>
              <Pressable
                style={styles.editSheetAction}
                onPress={() => {
                  setShowEditSheet(false);
                  Alert.alert('Kommer snart', 'Kommer snart');
                }}
              >
                <Ionicons name="image" size={20} color={accentColor} />
                <Text style={styles.editSheetActionText}>Skift hero-billede</Text>
              </Pressable>
              <Pressable
                style={styles.editSheetAction}
                onPress={() => {
                  setShowEditSheet(false);
                  Alert.alert('Kommer snart', 'Kommer snart');
                }}
              >
                <Ionicons name="people" size={20} color={accentColor} />
                <Text style={styles.editSheetActionText}>Administrér administratorer</Text>
              </Pressable>
              <Pressable
                style={styles.editSheetCancel}
                onPress={() => setShowEditSheet(false)}
              >
                <Text style={styles.editSheetCancelText}>Annuller</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (
  theme: ReturnType<typeof useTheme>,
  accentColor: string,
  layout: {
    heroHeight: number;
    avatarSize: number;
    avatarOverlap: number;
    screenPaddingX: number;
    sectionGap: number;
  },
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    header: {
      backgroundColor: accentColor,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
    },
    backButton: {
      padding: theme.spacing[1],
    },
    headerContent: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '600',
      color: theme.colors.bg.card,
    },
    shareButton: {
      padding: theme.spacing[1],
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollView: {
      flex: 1,
    },
    heroSection: {
      height: layout.heroHeight,
      backgroundColor: accentColor,
      opacity: 0.2,
    },
    avatarContainer: {
      alignItems: 'center',
      marginTop: -layout.avatarOverlap,
      marginBottom: theme.spacing[4],
    },
    avatarWrapper: {
      width: layout.avatarSize,
      height: layout.avatarSize,
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.spacing[1],
      borderColor: theme.colors.bg.card,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.bg.elevated,
    },
    avatarBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: accentColor,
      width: theme.spacing[6],
      height: theme.spacing[6],
      borderRadius: theme.radius.pill,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: theme.spacing[1],
      borderColor: theme.colors.bg.card,
    },
    titleSection: {
      paddingHorizontal: layout.screenPaddingX,
      marginBottom: theme.spacing[4],
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[2],
    },
    title: {
      fontSize: theme.typography.h2.fontSize,
      fontWeight: '700',
      color: theme.colors.text.primary,
      textAlign: 'center',
    },
    ctaContainer: {
      paddingHorizontal: layout.screenPaddingX,
      marginBottom: theme.spacing[5],
    },
    ctaButton: {
      height: theme.components.button.size.lg.height,
      paddingHorizontal: theme.components.button.size.lg.px,
      borderRadius: theme.components.button.radius,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accentColor,
    },
    ctaButtonPressed: {
      opacity: 0.8,
    },
    ctaButtonDisabled: {
      backgroundColor: theme.components.button.disabled.bg,
    },
    ctaButtonText: {
      fontSize: theme.typography.bodyBold.fontSize,
      fontWeight: theme.typography.bodyBold.fontWeight as any,
      color: theme.components.button.variants.primary.text,
    },
    ctaButtonTextDisabled: {
      color: theme.components.button.disabled.text,
    },
    membersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.screenPaddingX,
      paddingVertical: theme.spacing[3],
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.default,
      marginBottom: layout.sectionGap,
    },
    membersLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      flex: 1,
    },
    membersText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
    },
    membersAvatars: {
      flexDirection: 'row',
      marginRight: theme.spacing[3],
    },
    memberAvatarBubble: {
      width: theme.spacing[7],
      height: theme.spacing[7],
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: theme.colors.bg.card,
    },
    memberAvatarImage: {
      width: '100%',
      height: '100%',
    },
    memberAvatarPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.bg.elevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    seeAllText: {
      fontSize: theme.typography.caption.fontSize,
      color: accentColor,
      fontWeight: '600',
    },
    section: {
      paddingHorizontal: layout.screenPaddingX,
      marginBottom: layout.sectionGap,
    },
    sectionTitle: {
      fontSize: theme.typography.small.fontSize,
      fontWeight: '700',
      color: theme.colors.text.secondary,
      letterSpacing: 0.5,
      marginBottom: theme.spacing[3],
    },
    aboutText: {
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      color: theme.colors.text.primary,
    },
    emptyText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
      fontStyle: 'italic',
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.default,
    },
    eventIcon: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing[3],
    },
    eventContent: {
      flex: 1,
    },
    eventTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[1],
    },
    eventMeta: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
    },
    eventLocation: {
      fontSize: theme.typography.small.fontSize,
      color: theme.colors.text.secondary,
      marginTop: theme.spacing[0],
    },
    feedHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing[3],
    },
    newPostLink: {
      fontSize: theme.typography.caption.fontSize,
      color: accentColor,
      fontWeight: '600',
    },
    composerSection: {
      paddingHorizontal: layout.screenPaddingX,
      marginBottom: layout.sectionGap,
    },
    adminHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing[2],
      marginBottom: theme.spacing[3],
    },
    adminHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    membersList: {
      marginTop: theme.spacing[2],
    },
    adminMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.default,
    },
    adminMemberInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    adminMemberAvatar: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      marginRight: theme.spacing[3],
    },
    adminMemberAvatarPlaceholder: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.elevated,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: theme.spacing[3],
    },
    adminMemberDetails: {
      flex: 1,
    },
    adminMemberName: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[0],
    },
    adminMemberRole: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
    },
    roleToggle: {
      padding: theme.spacing[2],
      borderRadius: theme.radius.sm,
    },
    roleToggleActive: {
      backgroundColor: theme.colors.bg.elevated,
    },
    editInput: {
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      padding: theme.spacing[3],
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    editInputMultiline: {
      minHeight: theme.spacing[16] + theme.spacing[6],
      textAlignVertical: 'top',
    },
    editActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing[3],
      marginTop: theme.spacing[2],
    },
    editSheetOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay.medium,
    },
    editSheetBackdrop: {
      flex: 1,
    },
    editSheet: {
      backgroundColor: theme.colors.bg.card,
      padding: theme.spacing[4],
      borderTopLeftRadius: theme.radius.md,
      borderTopRightRadius: theme.radius.md,
    },
    editSheetTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: theme.typography.h3.fontWeight as any,
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[4],
    },
    editSheetAction: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[2],
      gap: theme.spacing[2],
    },
    editSheetActionText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.primary,
    },
    editSheetCancel: {
      marginTop: theme.spacing[4],
      alignSelf: 'center',
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[6],
    },
    editSheetCancelText: {
      color: theme.colors.text.secondary,
      fontSize: theme.typography.body.fontSize,
    },
    cancelButton: {
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[4],
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    cancelButtonText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
      fontWeight: '600',
    },
    saveButton: {
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[4],
      borderRadius: theme.radius.md,
    },
    saveButtonText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.bg.card,
      fontWeight: '600',
    },
  });
