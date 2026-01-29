import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { FanPostCard } from '../components/cards/FanPostCard';
import { Post } from '../types/post';
import { colors, spacing } from '../theme';
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

  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [postLikes, setPostLikes] = useState<Record<string, boolean>>({});

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [id]),
  );

  const loadData = async () => {
    setLoading(true);
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
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

  const toggleLike = (postId: string) => {
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.card} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Indlæser...</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
        </View>
      </SafeAreaView>
    );
  }

  if (!community) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.card} />
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
      <Text style={{ fontSize: 12, opacity: 0.7, padding: 4 }}>DEBUG: Community Detail v2</Text>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{community.name}</Text>
          <Text style={styles.headerSubtitle}>
            {memberCount > 0 ? `${memberCount} medlem${memberCount !== 1 ? 'mer' : ''}` : 'Fællesskab'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        {/* Community Info Card */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Pressable
              style={styles.avatar}
              onPress={canManage ? handleUploadAvatar : undefined}
              disabled={uploadingAvatar}
            >
              {community.avatar_url ? (
                <Image source={{ uri: community.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Ionicons
                  name={community.type === 'fan_faction' ? 'star' : 'people-circle'}
                  size={60}
                  color={colors.fcnRed}
                />
              )}
              {canManage && (
                <View style={styles.avatarBadge}>
                  <Ionicons name="camera" size={16} color={colors.card} />
                </View>
              )}
            </Pressable>
            <View style={styles.infoContent}>
              {!isEditing ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.infoTitle}>{community.name}</Text>
                    {canManage && (
                      <Pressable onPress={handleStartEdit} style={styles.editButton}>
                        <Ionicons name="create-outline" size={20} color={colors.fcnRed} />
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.infoDescription}>
                    {community.description || 'Ingen beskrivelse'}
                  </Text>
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.editInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Navn"
                    placeholderTextColor={colors.subtext}
                  />
                  <TextInput
                    style={[styles.editInput, styles.editInputMultiline]}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Beskrivelse"
                    placeholderTextColor={colors.subtext}
                    multiline
                    numberOfLines={3}
                  />
                  <View style={styles.editActions}>
                    <Pressable onPress={handleCancelEdit} style={styles.cancelButton}>
                      <Text style={styles.cancelButtonText}>Annuller</Text>
                    </Pressable>
                    <Pressable onPress={handleSaveEdit} style={styles.saveButton}>
                      <Text style={styles.saveButtonText}>Gem</Text>
                    </Pressable>
                  </View>
                </>
              )}
              <View style={styles.metaRow}>
                <Ionicons name="people" size={14} color={colors.subtext} />
                <Text style={styles.metaText}>
                  {memberCount > 0 ? `${memberCount} medlem${memberCount !== 1 ? 'mer' : ''}` : 'Ingen medlemmer'}
                </Text>
                {effectiveRole && (
                  <>
                    <Text style={styles.metaSeparator}>•</Text>
                    <Text style={styles.metaText}>
                      Din rolle: {effectiveRole === 'owner' ? 'Ejer' : effectiveRole === 'admin' ? 'Admin' : 'Medlem'}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
          <PrimaryButton
            title={
              joining
                ? 'Tilmelder...'
                : effectiveRole === 'owner'
                  ? 'Ejer af fællesskabet'
                  : isMember
                    ? 'Medlem af fællesskabet ✓'
                    : 'Bliv medlem'
            }
            variant={isMember ? 'blue' : 'red'}
            onPress={handleJoinLeave}
            disabled={joining || effectiveRole === 'owner'}
          />
        </Card>

        {/* Admin Panel - Only visible for owner/admin */}
        {canManage && (
          <Card style={styles.adminCard}>
            <Pressable
              style={styles.adminHeader}
              onPress={() => setShowMembers(!showMembers)}
            >
              <View style={styles.adminHeaderLeft}>
                <Ionicons name="shield-checkmark" size={20} color={colors.fcnRed} />
                <Text style={styles.sectionTitle}>ADMIN PANEL</Text>
              </View>
              <Ionicons
                name={showMembers ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.subtext}
              />
            </Pressable>

            {showMembers && (
              <View style={styles.membersList}>
                <Text style={styles.membersTitle}>Medlemmer ({members.length})</Text>
                {members.map((member) => (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={styles.memberInfo}>
                      {member.avatar_url ? (
                        <Image
                          source={{ uri: member.avatar_url }}
                          style={styles.memberAvatar}
                        />
                      ) : (
                        <View style={styles.memberAvatarPlaceholder}>
                          <Ionicons name="person" size={20} color={colors.subtext} />
                        </View>
                      )}
                      <View style={styles.memberDetails}>
                        <Text style={styles.memberName}>
                          {member.display_name || 'Unavngivet'}
                        </Text>
                        <Text style={styles.memberRole}>
                          {member.role === 'owner'
                            ? 'Ejer'
                            : member.role === 'admin'
                              ? 'Admin'
                              : 'Medlem'}
                        </Text>
                      </View>
                    </View>
                    {effectiveRole === 'owner' && member.role !== 'owner' && (
                      <Pressable
                        style={[
                          styles.roleToggle,
                          member.role === 'admin' && styles.roleToggleActive,
                        ]}
                        onPress={() => handleToggleRole(member.user_id, member.role)}
                      >
                        <Ionicons
                          name={member.role === 'admin' ? 'shield-checkmark' : 'shield-outline'}
                          size={20}
                          color={member.role === 'admin' ? colors.fcnRed : colors.subtext}
                        />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Upcoming Fixtures Section */}
        {fixtures.length > 0 && (
          <Card style={styles.eventsCard}>
            <Text style={styles.sectionTitle}>KOMMENDE KAMPE</Text>
            {fixtures.map((fixture) => (
              <Pressable
                key={fixture.id}
                style={styles.eventRow}
                onPress={() => (navigation as any).navigate('MatchDetails', { fixtureId: fixture.id })}
              >
                <View style={styles.eventIcon}>
                  <Ionicons name="football" size={20} color={colors.fcnRed} />
                </View>
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>
                    {fixture.home_team} vs {fixture.away_team}
                  </Text>
                  <Text style={styles.eventMeta}>{formatDateDa(fixture.kickoff_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
              </Pressable>
            ))}
          </Card>
        )}

        {/* Community Events Section */}
        {events.length > 0 && (
          <Card style={styles.eventsCard}>
            <Text style={styles.sectionTitle}>KOMMENDE ARRANGEMENTER</Text>
            {events.map((event) => (
              <Pressable
                key={event.id}
                style={styles.eventRow}
                onPress={() => (navigation as any).navigate('EventDetails', { eventId: event.id })}
              >
                <View style={styles.eventIcon}>
                  <Ionicons name="calendar" size={20} color={colors.fcnRed} />
                </View>
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>{formatDateDa(event.start_at)}</Text>
                  {event.location_name && (
                    <Text style={styles.eventLocation}>{event.location_name}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
              </Pressable>
            ))}
          </Card>
        )}

        {/* Composer Card - Only for members */}
        {isMember && (
          <Card style={styles.composerCard}>
            <Text style={styles.composerTitle}>Del noget med {community.name}…</Text>
            <PostComposer onSuccess={() => {
              console.log('[CommunityDetail] Post created successfully');
              loadData();
            }} />
          </Card>
        )}

        {/* Old text composer removed - PostComposer handles everything */}
        {/* Latest Updates */}
        {posts.length > 0 && (
          <View style={styles.updatesSection}>
            <Text style={styles.sectionTitle}>SENESTE OPDATERINGER</Text>
            {posts.map((post) => (
              <FanPostCard
                key={post.id}
                post={post}
                liked={postLikes[post.id] || false}
                onToggleLike={() => toggleLike(post.id)}
                onPressShare={() => console.log('Share post', post.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    backgroundColor: colors.blueButton,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    marginRight: spacing.sm,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.card,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.card,
    opacity: 0.8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    margin: spacing.md,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    marginRight: spacing.md,
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.fcnRed,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  infoDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: colors.subtext,
    marginLeft: spacing.xs,
  },
  metaSeparator: {
    fontSize: 12,
    color: colors.subtext,
    marginHorizontal: spacing.xs,
  },
  adminCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  adminHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  membersList: {
    marginTop: spacing.md,
  },
  membersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.sm,
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  memberRole: {
    fontSize: 12,
    color: colors.subtext,
  },
  roleToggle: {
    padding: spacing.sm,
  },
  roleToggleActive: {
    backgroundColor: '#FFE8E8',
    borderRadius: spacing.sm,
  },
  eventsCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  eventMeta: {
    fontSize: 12,
    color: colors.subtext,
  },
  eventLocation: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: 2,
  },
  composerCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  composerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  composerInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  composerActions: {
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  updatesSection: {
    paddingHorizontal: spacing.md,
  },
  editButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  editInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.subtext,
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.sm,
    backgroundColor: colors.fcnRed,
  },
  saveButtonText: {
    fontSize: 14,
    color: colors.card,
    fontWeight: '600',
  },
});
