import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { logger } from '../lib/logger';
import { pickCameraPhoto, pickImageFromLibrary } from '../lib/mediaPicker';
import { geocodeAddress } from '../services/geocoding';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import { MembersStatRow } from '../components/social/MembersStatRow';
import { IconButton } from '../components/ui';
import { getPublicUrl } from '../lib/storageUrl';
import { supabase } from '../lib/supabase';
import {
  CommunityFanFactionRequest,
  createFanFactionRequest,
  getPendingRequestForCommunity,
} from '../services/communityFanFactionRequests';
import {
  COMMUNITY_MEDIA_BUCKET,
  Community as CommunityData,
  CommunityMember,
  deleteCommunityAsAdmin,
  getCommunity,
  getMemberCount,
  getMembership,
  joinCommunity,
  leaveCommunity,
  listMembers,
  setMemberRole,
  updateCommunity,
  uploadCommunityAvatar,
  uploadCommunityCover,
} from '../services/communities';
import { Event as CommunityEvent, fetchEventsUpcoming } from '../services/eventsApi';
import { fetchPrimaryFixture, Fixture, formatDateDa } from '../services/fixtures';
import { useCreateSheet } from '../state/CreateSheetContext';
import { useFeed } from '../state/FeedContext';
import { useTheme } from '../theme';
import { getFeedItemKey } from '../types/feed';
import { Post } from '../types/post';
import { resolveAvatarUrl } from '../utils/avatar';
import { resolveProfileDisplayName } from '../utils/actor';

type CommunityDetailRouteProp = RouteProp<
  { CommunityDetail: { id: string; title: string } },
  'CommunityDetail'
>;

export default function CommunityDetailScreen() {
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
    attendanceMap,
    toggleLike,
    removePost,
    removeNews,
    incrementCommentCount,
    addCommentPreview,
  } = useFeed();
  const { openCreateSheet } = useCreateSheet();

  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [membership, setMembership] = useState<any>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showEditAbout, setShowEditAbout] = useState(false);
  const [editAboutText, setEditAboutText] = useState('');
  const [savingAbout, setSavingAbout] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [editLocationText, setEditLocationText] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [showEditPaymentInfo, setShowEditPaymentInfo] = useState(false);
  const [editMobilepayInfo, setEditMobilepayInfo] = useState('');
  const [editPaymentInstructions, setEditPaymentInstructions] = useState('');
  const [savingPaymentInfo, setSavingPaymentInfo] = useState(false);
  const [showFanFactionRequestModal, setShowFanFactionRequestModal] = useState(false);
  const [fanFactionRequestNote, setFanFactionRequestNote] = useState('');
  const [loadingFanFactionRequest, setLoadingFanFactionRequest] = useState(false);
  const [submittingFanFactionRequest, setSubmittingFanFactionRequest] = useState(false);
  const [pendingFanFactionRequest, setPendingFanFactionRequest] =
    useState<CommunityFanFactionRequest | null>(null);
  const [deletingCommunity, setDeletingCommunity] = useState(false);

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
    if (item.kind === 'post') {
      const post = item.data as any;
      const feedTargets = Array.isArray(post.feedTargets) ? post.feedTargets : [];
      return feedTargets.includes(`community:${id}`) || post.communityId === id;
    }
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

    // Load members for preview (handle RLS gracefully)
    try {
      const membersData = await listMembers(id);
      setMembers(membersData);
    } catch (error: any) {
      logger.warn('[CommunityDetail] Unable to load members preview:', error?.code || error);
      setMembers([]);
    }

    // Load the same primary fixture logic used by Home.
    const primaryFixture = await fetchPrimaryFixture();
    setNextFixture(primaryFixture);

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

  const runAfterEditSheetClose = useCallback((action: () => void | Promise<void>) => {
    setShowEditSheet(false);
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        void action();
      }, 150);
    });
  }, []);

  const handleUploadAvatar = async () => {
    if (!community) return;

    Alert.alert('Upload avatar', 'Vælg kilde', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Bibliotek',
        onPress: async () => {
          const asset = await pickImageFromLibrary();
          if (!asset?.uri) return;

          setUploadingAvatar(true);
          try {
            const kind = community.type === 'fan_faction' ? 'logo' : 'image';
            const success = await uploadCommunityAvatar(id, asset.uri, kind);
            if (success) {
              Alert.alert('Succes', 'Avatar uploadet!');
              loadData();
            }
          } finally {
            setUploadingAvatar(false);
          }
        },
      },
      {
        text: 'Kamera',
        onPress: async () => {
          const asset = await pickCameraPhoto();
          if (!asset?.uri) return;

          setUploadingAvatar(true);
          try {
            const kind = community.type === 'fan_faction' ? 'logo' : 'image';
            const success = await uploadCommunityAvatar(id, asset.uri, kind);
            if (success) {
              Alert.alert('Succes', 'Avatar uploadet!');
              loadData();
            }
          } finally {
            setUploadingAvatar(false);
          }
        },
      },
    ]);
  };

  const handleUploadCover = async () => {
    if (!community) return;

    Alert.alert('Upload hero-billede', 'Vælg kilde', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Bibliotek',
        onPress: async () => {
          const asset = await pickImageFromLibrary();
          if (!asset?.uri) return;

          setUploadingCover(true);
          try {
            const path = await uploadCommunityCover(id, asset.uri);
            if (path) {
              setCommunity((prev) => (prev ? { ...prev, cover_path: path } : prev));
              Alert.alert('Succes', 'Hero-billede uploadet!');
              loadData();
            }
          } finally {
            setUploadingCover(false);
          }
        },
      },
      {
        text: 'Kamera',
        onPress: async () => {
          const asset = await pickCameraPhoto();
          if (!asset?.uri) return;

          setUploadingCover(true);
          try {
            const path = await uploadCommunityCover(id, asset.uri);
            if (path) {
              setCommunity((prev) => (prev ? { ...prev, cover_path: path } : prev));
              Alert.alert('Succes', 'Hero-billede uploadet!');
              loadData();
            }
          } finally {
            setUploadingCover(false);
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
      logger.log('Share post:', postText);
      setPostText('');
    }
  };

  const handleSendMessageToAll = async () => {
    if (!broadcastMessage.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en besked');
      return;
    }

    setSendingMessage(true);
    try {
      // Fetch all members
      const allMembers = await listMembers(id);

      // Log for now - later we'll implement real DM/push
      logger.log('[Broadcast] Sending message to', allMembers.length, 'members');
      logger.log('[Broadcast] Message:', broadcastMessage);

      // TODO: Implement actual DM creation + push notification
      // For each member: createDirectMessage(member.id, broadcastMessage)
      // For each member: sendPushNotification(member.id, ...)

      Alert.alert(
        'Succes',
        `Besked sendt til ${allMembers.length} medlem${allMembers.length !== 1 ? 'mer' : ''}`,
      );
      setBroadcastMessage('');
      setShowMessageModal(false);
    } catch (error) {
      logger.error('[Broadcast] Error:', error);
      Alert.alert('Fejl', 'Kunne ikke sende besked. Prøv igen.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCreatePoll = () => {
    setShowEditSheet(false);
    // TODO: Navigate to PollCreateScreen when it exists
    Alert.alert('Kommer snart', 'Poll-funktionalitet er under udvikling');
  };

  const handleCreateEvent = () => {
    setShowEditSheet(false);
    // TODO: Navigate to EventCreateScreen or check if CreateNewEventScreen exists
    Alert.alert('Kommer snart', 'Event-oprettelse er under udvikling');
  };

  const handleEditHero = async () => {
    if (!community) return;
    runAfterEditSheetClose(handleUploadCover);
  };

  const handleRemoveHero = async () => {
    setShowEditSheet(false);
    if (!community) return;
    const success = await updateCommunity(community.id, { cover_path: null });
    if (!success) {
      Alert.alert('Fejl', 'Kunne ikke fjerne hero-billede. PrÃ¸v igen.');
      return;
    }

    setCommunity((prev) => (prev ? { ...prev, cover_path: null } : prev));
    Alert.alert('Succes', 'Hero-billede fjernet!');
    loadData();
  };

  const handleEditAvatar = async () => {
    if (!community) return;
    runAfterEditSheetClose(handleUploadAvatar);
  };

  const handleRemoveAvatar = async () => {
    setShowEditSheet(false);
    if (!community) return;
    const success = await updateCommunity(community.id, {
      avatar_path: null,
      avatar_url: null,
      avatar_kind: null,
    });
    if (!success) {
      Alert.alert('Fejl', 'Kunne ikke fjerne logo/avatar. PrÃ¸v igen.');
      return;
    }

    setCommunity((prev) =>
      prev
        ? { ...prev, avatar_path: null, avatar_url: null, avatar_kind: null }
        : prev,
    );
    Alert.alert('Succes', 'Logo/avatar fjernet!');
    loadData();
  };

  const handleEditAbout = () => {
    setShowEditSheet(false);
    setEditAboutText(community?.description || '');
    setShowEditAbout(true);
  };

  const handleEditLocation = () => {
    setShowEditSheet(false);
    setEditLocationText(community?.location_label || '');
    setShowEditLocation(true);
  };

  const handleEditPaymentInfo = () => {
    setShowEditSheet(false);
    setEditMobilepayInfo(community?.mobilepay_info || '');
    setEditPaymentInstructions(community?.mobilepay_instructions || '');
    setShowEditPaymentInfo(true);
  };

  const handleSaveAbout = async () => {
    setSavingAbout(true);
    try {
      const success = await updateCommunity(id, {
        description: editAboutText.trim() || null,
      });

      if (success) {
        Alert.alert('Succes', 'Beskrivelse opdateret!');
        setShowEditAbout(false);
        loadData();
      } else {
        Alert.alert('Fejl', 'Kunne ikke opdatere. Prøv igen.');
      }
    } catch (error) {
      logger.error('[CommunityDetail] Error saving about:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere. Prøv igen.');
    } finally {
      setSavingAbout(false);
    }
  };

  const handleSaveLocation = async () => {
    setSavingLocation(true);
    try {
      const trimmedLocation = editLocationText.trim();
      const updatePayload: any = {
        location_label: trimmedLocation || null,
      };

      // If location is provided, try to geocode
      if (trimmedLocation) {
        const addressQuery = trimmedLocation.toLowerCase().includes('danmark')
          ? trimmedLocation
          : `${trimmedLocation}, Danmark`;

        logger.log('[CommunityDetail] Geocoding location:', addressQuery);
        const geocodeResult = await geocodeAddress(addressQuery);

        if (geocodeResult) {
          // Success: update with coordinates
          updatePayload.lat = geocodeResult.lat;
          updatePayload.lng = geocodeResult.lng;
          updatePayload.place_name = geocodeResult.place_name;
          updatePayload.geocoded_at = new Date().toISOString();
          logger.log('[CommunityDetail] Geocode success:', geocodeResult);
        } else {
          // Failure: just update location_label without coords
          logger.warn('[CommunityDetail] Geocoding failed, continuing without coords');
          Alert.alert(
            'Info',
            'Kunne ikke finde koordinater – prøv fx "Værløse, Danmark"',
          );
        }
      }

      logger.log('[CommunityDetail] Sending update payload to updateCommunity:', updatePayload);
      const success = await updateCommunity(id, updatePayload);

      if (success) {
        Alert.alert('Succes', 'Lokation opdateret!');
        setShowEditLocation(false);
        loadData();
      } else {
        Alert.alert('Fejl', 'Kunne ikke opdatere. Prøv igen.');
      }
    } catch (error) {
      logger.error('[CommunityDetail] Error saving location:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere. Prøv igen.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSavePaymentInfo = async () => {
    setSavingPaymentInfo(true);
    try {
      const success = await updateCommunity(id, {
        mobilepay_info: editMobilepayInfo.trim() || null,
        mobilepay_instructions: editPaymentInstructions.trim() || null,
      });

      if (success) {
        Alert.alert('Succes', 'Betalingsinfo opdateret!');
        setShowEditPaymentInfo(false);
        loadData();
      } else {
        Alert.alert('Fejl', 'Kunne ikke opdatere. Prøv igen.');
      }
    } catch (error) {
      logger.error('[CommunityDetail] Error saving payment info:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere. Prøv igen.');
    } finally {
      setSavingPaymentInfo(false);
    }
  };

  const loadPendingFanFactionRequest = async (communityId: string) => {
    setLoadingFanFactionRequest(true);
    try {
      const request = await getPendingRequestForCommunity(communityId);
      setPendingFanFactionRequest(request);
    } finally {
      setLoadingFanFactionRequest(false);
    }
  };

  const openFanFactionRequestModal = async () => {
    if (!community) return;
    setShowEditSheet(false);
    setFanFactionRequestNote('');
    setShowFanFactionRequestModal(true);
    await loadPendingFanFactionRequest(community.id);
  };

  const handleSubmitFanFactionRequest = async () => {
    if (!community) return;

    setSubmittingFanFactionRequest(true);
    try {
      const result = await createFanFactionRequest({
        communityId: community.id,
        note: fanFactionRequestNote,
      });

      if (result.reason === 'ok' && result.request) {
        setPendingFanFactionRequest(result.request);
        Alert.alert('Succes', 'Anmodning sendt. Status: Afventer godkendelse.');
        return;
      }

      if (result.reason === 'already_pending') {
        const existing = await getPendingRequestForCommunity(community.id);
        setPendingFanFactionRequest(existing);
        Alert.alert('Afventer', 'Der findes allerede en afventende anmodning.');
        return;
      }

      if (result.reason === 'not_authenticated') {
        Alert.alert('Fejl', 'Du skal være logget ind for at sende en anmodning.');
        return;
      }

      Alert.alert('Fejl', 'Kunne ikke sende anmodning. Prøv igen.');
    } catch (error) {
      logger.error('[CommunityDetail] Error sending fan faction request:', error);
      Alert.alert('Fejl', 'Kunne ikke sende anmodning. Prøv igen.');
    } finally {
      setSubmittingFanFactionRequest(false);
    }
  };

  const handleDeleteCommunity = () => {
    if (!community) return;

    Alert.alert(
      'Slet fællesskab',
      `Er du sikker på, at du vil slette "${community.name}"? Dette kan ikke fortrydes.`,
      [
        { text: 'Annuller', onPress: () => {}, style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            setDeletingCommunity(true);
            try {
              const success = await deleteCommunityAsAdmin(community.id);
              if (success) {
                Alert.alert('Succes', 'Fællesskab slettet.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      setShowEditSheet(false);
                      navigation.goBack();
                    },
                  },
                ]);
              } else {
                Alert.alert('Fejl', 'Kunne ikke slette fællesskab. Prøv igen.');
              }
            } catch (error) {
              logger.error('[CommunityDetail] Error deleting community:', error);
              Alert.alert('Fejl', 'Kunne ikke slette fællesskab. Prøv igen.');
            } finally {
              setDeletingCommunity(false);
            }
          },
        },
      ],
    );
  };

  // Owner fallback: if user is owner but no membership record, treat as 'owner' role
  const isOwner = community?.owner_id === currentUserId;
  const effectiveRole = membership?.role ?? (isOwner ? 'owner' : null);
  const canManage = effectiveRole === 'owner' || effectiveRole === 'admin';
  const isMember = !!effectiveRole;

  // Layout constants from contract (P0 spec)
  const LAYOUT = {
    heroHeight: theme.spacing[16] + theme.spacing[8],
    avatarSize: theme.spacing[16] + theme.spacing[10],
    avatarOverlap: theme.spacing[7],
    screenPaddingX: theme.spacing[4],
    sectionGap: theme.spacing[4],
  };

  // Accent color based on type
  const accentColor =
    community?.type === 'fan_faction' ? theme.colors.primary : theme.colors.state.info;

  const heroUrl = community?.cover_path
    ? getPublicUrl(COMMUNITY_MEDIA_BUCKET, community.cover_path)
    : null;

  // Use resolveAvatarUrl for consistent avatar handling (handles both path and URL)
  const avatarUrl = resolveAvatarUrl(community?.avatar_url);

  const locationLabel = community?.location_label?.trim() || null;

  const renderEventCard = (params: {
    type: 'match' | 'event' | 'bus_trip';
    title: string;
    dateIso: string;
    location?: string | null;
    onPress: () => void;
  }) => {
    const meta = [formatDateDa(params.dateIso), params.location].filter(Boolean).join(' • ');

    // Map type to icon
    const iconName =
      params.type === 'match' ? 'football' : params.type === 'bus_trip' ? 'bus' : 'calendar';

    return (
      <Pressable style={styles.eventCard} onPress={params.onPress}>
        <View style={styles.eventIconBadge}>
          <Ionicons name={iconName} size={theme.spacing[5]} color={theme.colors.primary} />
        </View>
        <View style={styles.eventCardContent}>
          <Text style={styles.eventCardTitle} numberOfLines={2}>
            {params.title}
          </Text>
          {meta ? (
            <Text style={styles.eventCardMeta} numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name="chevron-forward"
          size={theme.components.icon.size.sm}
          color={theme.colors.text.secondary}
        />
      </Pressable>
    );
  };

  const styles = makeStyles(theme, accentColor, LAYOUT);
  const renderKeyboardAwareFormModal = ({
    visible,
    onClose,
    children,
  }: {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalFormRoot}
        >
          <View style={styles.editSheetOverlay}>
            <Pressable style={styles.editSheetBackdrop} onPress={onClose} />
            <ScrollView
              style={styles.editSheetScrollContainer}
              contentContainerStyle={[
                styles.editSheetScrollContent,
                { paddingBottom: insets.bottom + theme.spacing[4] },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.editSheet}>{children}</View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );

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
        {canManage ? (
          <IconButton
            icon="ellipsis-horizontal"
            size="md"
            variant="ghost"
            color={theme.colors.bg.card}
            onPress={() => setShowEditSheet(true)}
          />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.contentArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + theme.spacing[6] + theme.spacing[4] },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
        {/* 2. Hero Section */}
        <View style={styles.heroSection}>
          {heroUrl ? (
            <Image source={{ uri: heroUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroFallback} />
          )}
          {uploadingCover && (
            <View style={styles.heroLoading}>
              <ActivityIndicator size="small" color={theme.colors.bg.card} />
            </View>
          )}
        </View>

        {/* 3. Avatar - centered, overlapping hero */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons
                  name={community.type === 'fan_faction' ? 'star' : 'people-circle'}
                  size={LAYOUT.avatarSize * 0.6}
                  color={accentColor}
                />
              </View>
            )}
          </View>
        </View>

        {/* 4. Title */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{community.name}</Text>
          </View>
          <Text style={styles.tagline}>
            {community.type === 'fan_faction' ? 'Den officielle fanklub' : 'Lokalt fællesskab'}
          </Text>
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
            <View style={styles.ctaButtonContent}>
              {!effectiveRole && (
                <Ionicons
                  name="person-add"
                  size={16}
                  color={theme.components.button.variants.primary.text}
                />
              )}
              <Text style={[styles.ctaButtonText, effectiveRole && styles.ctaButtonTextDisabled]}>
                {joining
                  ? 'Tilmelder...'
                  : effectiveRole
                    ? effectiveRole === 'member'
                      ? 'Medlem'
                      : 'Ejer'
                    : 'Bliv medlem'}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* 6. Members Row */}
        <MembersStatRow
          iconName="people"
          label="Medlemmer"
          valueText={`${memberCount} medlem${memberCount !== 1 ? 'mer' : ''}`}
          avatars={members
            .slice(0, 5)
            .map((member) => resolveAvatarUrl(member.avatar_url))
            .filter((url): url is string => !!url)}
          actionText="Se alle"
          horizontalPadding={LAYOUT.screenPaddingX}
          showBorders
          marginBottom={theme.spacing[2]}
          onPress={() =>
            (navigation as any).navigate('CommunityMembers', {
              communityId: id,
              title: community.name,
              communityType: community.type,
            })
          }
        />

        {/* 7. Om Os Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OM OS</Text>
          <Text style={styles.aboutText} numberOfLines={4}>
            {community.description || 'Ingen beskrivelse endnu.'}
          </Text>
          {locationLabel && <Text style={styles.locationText}>Område: {locationLabel}</Text>}
        </View>

        {/* 8. Kommende Events Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KOMMENDE EVENTS</Text>
          {nextFixture &&
            renderEventCard({
              type: 'match',
              title: `${nextFixture.home_team} vs ${nextFixture.away_team}`,
              dateIso: nextFixture.kickoff_at,
              location: nextFixture.venue || nextFixture.venue_city,
              onPress: () =>
                (navigation as any).navigate('MatchDetails', { fixtureId: nextFixture.id }),
            })}
          {events.length > 0 &&
            events.map((event) =>
              renderEventCard({
                type: 'event',
                title: event.title,
                dateIso: event.start_at,
                location: event.location_name,
                onPress: () => (navigation as any).navigate('EventDetails', { eventId: event.id }),
              }),
            )}
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
                  // @ts-ignore
                  attendanceMap={attendanceMap}
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
            <Pressable
              style={({ pressed }) => [styles.composerEntryCard, pressed && styles.composerEntryCardPressed]}
              onPress={() => {
                openCreateSheet({
                  initialContentType: 'post',
                  initialFeedTargets: [`community:${id}`],
                  initialActor: user
                    ? {
                        type: 'user',
                        id: user.id,
                        name: resolveProfileDisplayName(profileMap, user.id, user.email || undefined),
                      }
                    : undefined,
                });
              }}
            >
              <View style={styles.composerEntryLeading}>
                <Ionicons name="create-outline" size={18} color={accentColor} />
              </View>
              <View style={styles.composerEntryBody}>
                <Text style={styles.composerEntryTitle}>Hvad er på dit hjerte?</Text>
                <Text style={styles.composerEntrySubtitle}>Opslå i {community.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.text.secondary} />
            </Pressable>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showEditSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditSheet(false)}
      >
        <View style={styles.editSheetOverlay}>
          <Pressable style={styles.editSheetBackdrop} onPress={() => setShowEditSheet(false)} />
          <View style={styles.editSheet}>
            <Text style={styles.editSheetTitle}>Admin handlinger</Text>
            {canManage && (
              <>
                {/* Primary action: Send message to all */}
                <Pressable
                  style={[styles.primaryAction, { backgroundColor: accentColor }]}
                  onPress={() => {
                    setShowEditSheet(false);
                    setShowMessageModal(true);
                  }}
                >
                  <Ionicons name="send" size={20} color={theme.colors.text.inverse} />
                  <Text style={styles.primaryActionText}>Send besked til alle</Text>
                </Pressable>

                {/* Secondary actions: Poll and Event */}
                <View style={styles.secondaryActionsRow}>
                  <Pressable
                    style={[styles.secondaryAction, { borderColor: theme.colors.border.default }]}
                    onPress={handleCreatePoll}
                  >
                    <Ionicons name="bar-chart-outline" size={20} color={accentColor} />
                    <Text style={[styles.secondaryActionText, { color: accentColor }]}>
                      Lav Poll
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.secondaryAction, { borderColor: theme.colors.border.default }]}
                    onPress={handleCreateEvent}
                  >
                    <Ionicons name="calendar-outline" size={20} color={accentColor} />
                    <Text style={[styles.secondaryActionText, { color: accentColor }]}>
                      Opret event
                    </Text>
                  </Pressable>
                </View>

                {/* Divider */}
                <View style={styles.editSheetDivider} />

                {/* Edit options */}
                <Pressable style={styles.editSheetAction} onPress={handleEditHero}>
                  <Ionicons name="image-outline" size={20} color={theme.colors.text.primary} />
                  <Text style={styles.editSheetActionText}>Skift hero-billede</Text>
                </Pressable>
                <Pressable style={styles.editSheetAction} onPress={handleRemoveHero}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color={theme.colors.text.primary}
                  />
                  <Text style={styles.editSheetActionText}>Fjern hero-billede</Text>
                </Pressable>
                <Pressable style={styles.editSheetAction} onPress={handleEditAvatar}>
                  <Ionicons name="camera-outline" size={20} color={theme.colors.text.primary} />
                  <Text style={styles.editSheetActionText}>Skift logo/avatar</Text>
                </Pressable>
                <Pressable style={styles.editSheetAction} onPress={handleRemoveAvatar}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color={theme.colors.text.primary}
                  />
                  <Text style={styles.editSheetActionText}>Fjern logo/avatar</Text>
                </Pressable>

                <Pressable style={styles.editSheetAction} onPress={handleEditAbout}>
                  <Ionicons
                    name="document-text-outline"
                    size={20}
                    color={theme.colors.text.primary}
                  />
                  <Text style={styles.editSheetActionText}>Redigér "Om os"</Text>
                </Pressable>

                <Pressable style={styles.editSheetAction} onPress={handleEditLocation}>
                  <Ionicons name="location-outline" size={20} color={theme.colors.text.primary} />
                  <Text style={styles.editSheetActionText}>Redigér "Lokation"</Text>
                </Pressable>

                <Pressable style={styles.editSheetAction} onPress={handleEditPaymentInfo}>
                  <Ionicons name="card-outline" size={20} color={theme.colors.text.primary} />
                  <Text style={styles.editSheetActionText}>Redigér betalingsinfo</Text>
                </Pressable>

                {community?.type === 'community' && (
                  <Pressable style={styles.editSheetAction} onPress={openFanFactionRequestModal}>
                    <Ionicons
                      name="flag-outline"
                      size={20}
                      color={theme.colors.text.primary}
                    />
                    <Text style={styles.editSheetActionText}>
                      {pendingFanFactionRequest
                        ? 'Anmod om fanfraktion (Afventer)'
                        : 'Anmod om fanfraktion'}
                    </Text>
                  </Pressable>
                )}

                {isAppAdmin && (
                  <>
                    <View style={styles.editSheetDivider} />
                    <Pressable
                      style={[
                        styles.editSheetAction,
                        { opacity: deletingCommunity ? 0.6 : 1 },
                      ]}
                      onPress={handleDeleteCommunity}
                      disabled={deletingCommunity}
                    >
                      <Ionicons
                        name="trash-bin-outline"
                        size={20}
                        color={theme.colors.state.error}
                      />
                      <Text style={[styles.editSheetActionText, { color: theme.colors.state.error }]}>
                        {deletingCommunity ? 'Sletter...' : 'Slet fællesskab'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </>
            )}
            <Pressable style={styles.editSheetCancel} onPress={() => setShowEditSheet(false)}>
              <Text style={styles.editSheetCancelText}>Annuller</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showFanFactionRequestModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFanFactionRequestModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.editSheetOverlay}>
              <Pressable
                style={styles.editSheetBackdrop}
                onPress={() => setShowFanFactionRequestModal(false)}
              />
              <ScrollView
                style={styles.editSheetScrollContainer}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.editSheet}>
                  <Text style={styles.editSheetTitle}>Anmod om fanfraktion</Text>
                  <Text style={styles.messageModalSubtitle}>
                    Send en anmodning om at opgradere dette fællesskab til fanfraktion.
                  </Text>

                  {loadingFanFactionRequest ? (
                    <View style={styles.requestLoadingRow}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    </View>
                  ) : pendingFanFactionRequest ? (
                    <View style={styles.requestStatusBox}>
                      <Text style={styles.requestStatusText}>Status: Afventer godkendelse</Text>
                    </View>
                  ) : null}

                  <TextInput
                    style={[styles.editInput, styles.editInputMultiline]}
                    value={fanFactionRequestNote}
                    onChangeText={setFanFactionRequestNote}
                    placeholder="Begrundelse (valgfri)"
                    placeholderTextColor={theme.colors.text.secondary}
                    multiline
                    numberOfLines={4}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => Keyboard.dismiss()}
                    editable={
                      !submittingFanFactionRequest && !loadingFanFactionRequest && !pendingFanFactionRequest
                    }
                  />

                  <View style={styles.messageModalActions}>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => setShowFanFactionRequestModal(false)}
                      disabled={submittingFanFactionRequest}
                    >
                      <Text style={styles.cancelButtonText}>Annuller</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.saveButton,
                        { backgroundColor: accentColor },
                        (loadingFanFactionRequest || submittingFanFactionRequest || !!pendingFanFactionRequest) &&
                          styles.disabledSaveButton,
                      ]}
                      onPress={handleSubmitFanFactionRequest}
                      disabled={
                        loadingFanFactionRequest || submittingFanFactionRequest || !!pendingFanFactionRequest
                      }
                    >
                      {submittingFanFactionRequest ? (
                        <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                      ) : (
                        <Text style={styles.saveButtonText}>
                          {pendingFanFactionRequest ? 'Afventer' : 'Send anmodning'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Message broadcast modal */}
      {renderKeyboardAwareFormModal({
        visible: showMessageModal,
        onClose: () => setShowMessageModal(false),
        children: (
          <>
            <Text style={styles.editSheetTitle}>Send besked til alle</Text>
            <Text style={styles.messageModalSubtitle}>
              Beskeden sendes til alle {memberCount} medlem{memberCount !== 1 ? 'mer' : ''}
            </Text>
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={broadcastMessage}
              onChangeText={setBroadcastMessage}
              placeholder="Skriv din besked..."
              placeholderTextColor={theme.colors.text.secondary}
              multiline
              numberOfLines={4}
              editable={!sendingMessage}
            />
            <View style={styles.messageModalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => {
                  setShowMessageModal(false);
                  setBroadcastMessage('');
                }}
                disabled={sendingMessage}
              >
                <Text style={styles.cancelButtonText}>Annuller</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, { backgroundColor: accentColor }]}
                onPress={handleSendMessageToAll}
                disabled={sendingMessage || !broadcastMessage.trim()}
              >
                {sendingMessage ? (
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                ) : (
                  <Text style={styles.saveButtonText}>Send</Text>
                )}
              </Pressable>
            </View>
          </>
        ),
      })}

      {/* Edit About modal */}
      <Modal
        visible={showEditAbout}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditAbout(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalFormRoot}
          >
            <View style={styles.editSheetOverlay}>
              <Pressable style={styles.editSheetBackdrop} onPress={() => setShowEditAbout(false)} />
              <View style={styles.editAboutSheetContainer}>
                <ScrollView
                  style={styles.editAboutSheetScrollContainer}
                  contentContainerStyle={[
                    styles.editAboutSheetScrollContent,
                    { paddingBottom: insets.bottom + theme.spacing[4] },
                  ]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  automaticallyAdjustKeyboardInsets
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.editSheet}>
            <Text style={styles.editSheetTitle}>Redigér "Om os"</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={editAboutText}
              onChangeText={setEditAboutText}
              placeholder="Beskrivelse af fællesskabet..."
              placeholderTextColor={theme.colors.text.secondary}
              multiline
              numberOfLines={4}
              editable={!savingAbout}
            />
            <View style={styles.messageModalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => {
                  setShowEditAbout(false);
                  setEditAboutText('');
                }}
                disabled={savingAbout}
              >
                <Text style={styles.cancelButtonText}>Annuller</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, { backgroundColor: accentColor }]}
                onPress={handleSaveAbout}
                disabled={savingAbout}
              >
                {savingAbout ? (
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                ) : (
                  <Text style={styles.saveButtonText}>Gem</Text>
                )}
              </Pressable>
            </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Edit Location modal */}
      <Modal
        visible={showEditLocation}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditLocation(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalFormRoot}
          >
            <View style={styles.editSheetOverlay}>
              <Pressable style={styles.editSheetBackdrop} onPress={() => setShowEditLocation(false)} />
              <ScrollView
                style={styles.editSheetScrollContainer}
                contentContainerStyle={[
                  styles.editSheetScrollContent,
                  { paddingBottom: insets.bottom + theme.spacing[4] },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                automaticallyAdjustKeyboardInsets
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.editSheet}>
            <Text style={styles.editSheetTitle}>Redigér "Lokation"</Text>
            <TextInput
              style={styles.editInput}
              value={editLocationText}
              onChangeText={setEditLocationText}
              placeholder="Område eller by..."
              placeholderTextColor={theme.colors.text.secondary}
              editable={!savingLocation}
            />
            <View style={styles.messageModalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => {
                  setShowEditLocation(false);
                  setEditLocationText('');
                }}
                disabled={savingLocation}
              >
                <Text style={styles.cancelButtonText}>Annuller</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, { backgroundColor: accentColor }]}
                onPress={handleSaveLocation}
                disabled={savingLocation}
              >
                {savingLocation ? (
                  <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                ) : (
                  <Text style={styles.saveButtonText}>Gem</Text>
                )}
              </Pressable>
            </View>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={showEditPaymentInfo}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditPaymentInfo(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.editSheetOverlay}>
              <Pressable
                style={styles.editSheetBackdrop}
                onPress={() => setShowEditPaymentInfo(false)}
              />
              <ScrollView
                style={styles.editSheetScrollContainer}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.editSheet}>
                  <Text style={styles.editSheetTitle}>Betalingsinfo</Text>
                  <Text style={styles.messageModalSubtitle}>
                    Denne info bruges som standard for betalte fanaktiviteter.
                  </Text>

                  <TextInput
                    style={styles.editInput}
                    value={editMobilepayInfo}
                    onChangeText={setEditMobilepayInfo}
                    placeholder="MobilePay nummer/navn"
                    placeholderTextColor={theme.colors.text.secondary}
                    returnKeyType="next"
                  />

                  <TextInput
                    style={[styles.editInput, styles.editInputMultiline]}
                    value={editPaymentInstructions}
                    onChangeText={setEditPaymentInstructions}
                    placeholder="Valgfri betalingsinstruktion"
                    placeholderTextColor={theme.colors.text.secondary}
                    multiline
                    numberOfLines={4}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />

                  <View style={styles.editActions}>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => setShowEditPaymentInfo(false)}
                      disabled={savingPaymentInfo}
                    >
                      <Text style={styles.cancelButtonText}>Annuller</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.saveButton,
                        { backgroundColor: accentColor, opacity: savingPaymentInfo ? 0.6 : 1 },
                      ]}
                      onPress={handleSavePaymentInfo}
                      disabled={savingPaymentInfo}
                    >
                      <Text style={styles.saveButtonText}>
                        {savingPaymentInfo ? 'Gemmer...' : 'Gem'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
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
    contentArea: {
      flex: 1,
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
    headerSpacer: {
      width: theme.spacing[10],
    },
    shareButton: {
      padding: theme.spacing[1],
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalFormRoot: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    heroSection: {
      height: layout.heroHeight,
      backgroundColor: theme.colors.bg.default,
      position: 'relative',
      overflow: 'hidden',
    },
    heroImage: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    heroFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: accentColor,
      opacity: 0.2,
    },
    heroLoading: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay.light,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEditButton: {
      position: 'absolute',
      right: theme.spacing[3],
      bottom: theme.spacing[3],
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      backgroundColor: accentColor,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.spacing[1],
      borderColor: theme.colors.bg.card,
    },
    heroEditButtonDisabled: {
      opacity: 0.7,
    },
    avatarContainer: {
      alignItems: 'center',
      marginTop: -layout.avatarOverlap,
      marginBottom: theme.spacing[1],
    },
    avatarWrapper: {
      width: layout.avatarSize,
      height: layout.avatarSize,
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: theme.colors.bg.card,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
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
      marginBottom: theme.spacing[0],
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
    tagline: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      textAlign: 'center',
      marginTop: theme.spacing[0],
    },
    ctaContainer: {
      paddingHorizontal: layout.screenPaddingX,
      marginBottom: theme.spacing[3],
    },
    ctaButton: {
      height: theme.components.button.size.lg.height,
      paddingHorizontal: theme.components.button.size.lg.px,
      borderRadius: theme.components.button.radius,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accentColor,
      width: '100%',
    },
    ctaButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    ctaButtonPressed: {
      opacity: 0.8,
    },
    ctaButtonDisabled: {
      backgroundColor: accentColor,
      opacity: 0.8,
    },
    ctaButtonText: {
      fontSize: theme.typography.bodyBold.fontSize,
      fontWeight: theme.typography.bodyBold.fontWeight as any,
      color: theme.components.button.variants.primary.text,
    },
    ctaButtonTextDisabled: {
      color: theme.components.button.variants.primary.text,
    },
    membersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPaddingX,
      paddingVertical: theme.spacing[2],
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.default,
      marginBottom: theme.spacing[2],
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
      marginRight: theme.spacing[2],
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
      fontSize: theme.typography.h3.fontSize,
      fontWeight: theme.typography.h3.fontWeight as any,
      lineHeight: theme.typography.h3.lineHeight,
      color: theme.colors.text.primary,
      letterSpacing: 0.4,
      marginTop: theme.spacing[0],
      marginBottom: theme.spacing[1],
    },
    aboutText: {
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      color: theme.colors.text.primary,
    },
    locationText: {
      marginTop: theme.spacing[2],
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
    },
    emptyText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
      fontStyle: 'italic',
    },
    eventCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      marginBottom: theme.spacing[2],
      gap: theme.spacing[2],
    },
    eventIconBadge: {
      width: theme.spacing[7],
      height: theme.spacing[7],
      borderRadius: theme.radius.pill,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    eventCardContent: {
      flex: 1,
    },
    eventCardTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      lineHeight: theme.typography.body.lineHeight,
      color: theme.colors.text.primary,
    },
    eventCardMeta: {
      marginTop: theme.spacing[0],
      fontSize: theme.typography.small.fontSize,
      lineHeight: theme.typography.small.lineHeight,
      color: theme.colors.text.secondary,
    },
    feedHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing[2],
      paddingHorizontal: layout.screenPaddingX,
    },
    newPostLink: {
      fontSize: theme.typography.caption.fontSize,
      color: accentColor,
      fontWeight: '600',
    },
    composerSection: {
      marginBottom: layout.sectionGap,
      paddingHorizontal: layout.screenPaddingX,
    },
    composerEntryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    composerEntryCardPressed: {
      opacity: 0.88,
    },
    composerEntryLeading: {
      width: theme.spacing[9],
      height: theme.spacing[9],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.elevated,
    },
    composerEntryBody: {
      flex: 1,
    },
    composerEntryTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.primary,
    },
    composerEntrySubtitle: {
      marginTop: theme.spacing[0],
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
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
    editSheetScrollContainer: {
      flex: 1,
      maxHeight: '85%',
    },
    editSheetScrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
    },
    editAboutSheetContainer: {
      width: '100%',
      maxHeight: '85%',
      flexShrink: 1,
    },
    editAboutSheetScrollContainer: {
      width: '100%',
      flexGrow: 0,
      flexShrink: 1,
    },
    editAboutSheetScrollContent: {
      flexGrow: 0,
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
    primaryAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[3],
      borderRadius: theme.radius.md,
      gap: theme.spacing[2],
      marginBottom: theme.spacing[3],
    },
    primaryActionText: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.inverse,
    },
    secondaryActionsRow: {
      flexDirection: 'row',
      gap: theme.spacing[2],
      marginBottom: theme.spacing[3],
    },
    secondaryAction: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[3],
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      gap: theme.spacing[1],
    },
    secondaryActionText: {
      fontSize: theme.typography.small.fontSize,
      fontWeight: '600',
    },
    messageModalSubtitle: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing[3],
    },
    messageModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    requestLoadingRow: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing[3],
    },
    requestStatusBox: {
      backgroundColor: theme.colors.bg.elevated,
      borderRadius: theme.radius.md,
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      marginBottom: theme.spacing[3],
    },
    requestStatusText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      fontWeight: '600',
    },
    editSheetDivider: {
      height: theme.layout.borderHairline,
      backgroundColor: theme.colors.border.default,
      marginVertical: theme.spacing[3],
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
    disabledSaveButton: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.bg.card,
      fontWeight: '600',
    },
  });
