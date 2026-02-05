import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { OutlineButton } from '../components/ui/OutlineButton';
import { colors, spacing } from '../theme';
import { useTheme } from '../theme';
import { uploadAvatar } from '../lib/uploadAvatar';
import { getPublicUrl } from '../lib/storageUrl';
import { Avatar } from '../components/Avatar';
import {
  fetchMyProfile,
  fetchMyCommunities,
  fetchMyUpcomingItems,
  countOwnedCommunities,
  formatMemberSince,
  formatEventDate,
  type UserProfile,
  type MyCommunity,
  type UpcomingItem,
} from '../services/profileApi';

function SectionCard({
  title,
  icon,
  children,
  styles,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useTheme();
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>{title}</Text>
        {icon && <Ionicons name={icon as any} size={16} color={theme.colors.primary} />}
      </View>
      {children}
    </Card>
  );
}

function ProfileRow({
  icon,
  title,
  subtitle,
  onPress,
  isLogout,
  styles,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  isLogout?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      style={[styles.row, { borderBottomColor: theme.colors.border.default }]}
      onPress={onPress}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: theme.colors.primary },
          isLogout && { backgroundColor: theme.colors.primary },
        ]}
      >
        <Ionicons name={icon as any} size={16} color={theme.colors.bg.card} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowTitle,
            { color: theme.colors.text.primary },
            isLogout && { color: theme.colors.primary },
          ]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.rowSubtitle, { color: theme.colors.text.secondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.text.secondary} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownerCommunities, setOwnerCommunities] = useState<MyCommunity[]>([]);
  const [memberCommunities, setMemberCommunities] = useState<MyCommunity[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([]);
  const [ownedCount, setOwnedCount] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const results = await Promise.allSettled([
      fetchMyProfile(user.id),
      fetchMyCommunities(user.id),
      fetchMyUpcomingItems(user.id),
      countOwnedCommunities(user.id),
    ]);

    // Extract profile
    if (results[0].status === 'fulfilled') {
      setProfile(results[0].value);
    }

    // Extract communities
    if (results[1].status === 'fulfilled') {
      setOwnerCommunities(results[1].value.ownerCommunities);
      setMemberCommunities(results[1].value.memberCommunities);
    }

    // Extract upcoming items
    if (results[2].status === 'fulfilled') {
      setUpcomingItems(results[2].value);
    }

    // Extract owned count
    if (results[3].status === 'fulfilled') {
      setOwnedCount(results[3].value);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, []),
  );

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const handleEditProfile = () => {
    Alert.alert('Rediger profil', 'Denne funktion kommer snart!');
  };

  const handleUploadAvatar = async () => {
    if (!user?.id) return;

    setUploadingAvatar(true);
    const avatarPath = await uploadAvatar(user.id);
    setUploadingAvatar(false);

    if (avatarPath) {
      // avatarPath includes cache buster, store it directly
      setProfile((prev) => (prev ? { ...prev, avatar_url: avatarPath } : null));
      Alert.alert('Succes!', 'Profilbillede opdateret');
    } else {
      Alert.alert('Fejl', 'Kunne ikke uploade billede. Prøv igen.');
    }
  };

  const navigateToCommunity = (communityId: string) => {
    (navigation as any).navigate('CommunityDetail', { communityId });
  };

  const navigateToItem = (item: UpcomingItem) => {
    if (item.targetType === 'match') {
      (navigation as any).navigate('MatchDetails', { fixtureId: item.targetId });
    } else if (item.targetType === 'bus_trip') {
      (navigation as any).navigate('BusTripDetails', { busTripId: item.targetId });
    } else if (item.targetType === 'event') {
      (navigation as any).navigate('EventDetails', { eventId: item.targetId });
    }
  };

  const getItemIcon = (type: string): string => {
    if (type === 'match') return 'football';
    if (type === 'bus_trip') return 'bus';
    return 'calendar';
  };

  // If not logged in
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg.default }]}>
        <View style={styles.headerSection}>
          <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>Min Profil</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.text.secondary }]}>
            Indstillinger & fællesskaber
          </Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="person-circle-outline" size={64} color={theme.colors.text.secondary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text.primary }]}>
            Du skal være logget ind
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.colors.text.secondary }]}>
            Log ind for at se din profil
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg.default }]}>
        <View style={styles.headerSection}>
          <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>Min Profil</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.text.secondary }]}>
            Indstillinger & fællesskaber
          </Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text.secondary }]}>
            Henter profil...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.bg.default }]}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 24 }}
    >
      {/* Simple header without red background */}
      <View style={styles.headerSection}>
        <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>Min Profil</Text>
        <Text style={[styles.headerSubtitle, { color: theme.colors.text.secondary }]}>
          Indstillinger & fællesskaber
        </Text>
      </View>

      {/* Avatar Upload Banner - Always visible */}
      {!uploadingAvatar && (
        <Card style={[styles.avatarBanner, { marginBottom: spacing.md }]}>
          <View style={styles.bannerContent}>
            <Ionicons name="camera" size={24} color={theme.colors.primary} />
            <View style={styles.bannerText}>
              <Text style={[styles.bannerTitle, { color: theme.colors.text.primary }]}>
                {profile?.avatar_url ? 'Skift profilbillede' : 'Tilføj profilbillede'}
              </Text>
              <Text style={[styles.bannerSubtitle, { color: theme.colors.text.secondary }]}>
                {profile?.avatar_url ? 'Upload nyt billede' : 'Gør din profil mere personlig'}
              </Text>
            </View>
          </View>
          <Pressable
            style={[styles.bannerButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleUploadAvatar}
          >
            <Text style={[styles.bannerButtonText, { color: theme.colors.bg.card }]}>
              {profile?.avatar_url ? 'Skift' : 'Upload'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.bg.card} />
          </Pressable>
        </Card>
      )}

      {/* Uploading state */}
      {uploadingAvatar && (
        <Card style={{ marginBottom: spacing.md, padding: spacing.lg }}>
          <View style={{ alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={{ marginTop: spacing.sm, color: theme.colors.text.secondary }}>
              Uploader billede...
            </Text>
          </View>
        </Card>
      )}

      {/* Profile Card */}
      <Card style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        <View style={styles.profileSummary}>
          <Pressable onPress={handleUploadAvatar} disabled={uploadingAvatar}>
            <View style={styles.avatar}>
              <Avatar
                userId={user?.id}
                avatarUrl={profile?.avatar_url}
                size={64}
                label={profile?.display_name || user?.email || 'Fan'}
              />
              {/* Camera icon overlay */}
              <View
                style={[
                  styles.avatarOverlay,
                  { backgroundColor: theme.colors.primary, borderColor: theme.colors.bg.card },
                ]}
              >
                <Ionicons name="camera" size={20} color={theme.colors.bg.card} />
              </View>
            </View>
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.colors.text.primary }]}>
              {profile?.display_name || user?.email || 'Fan'}
            </Text>
            <Text style={[styles.profileSubtext, { color: theme.colors.text.secondary }]}>
              {profile?.member_since
                ? `Medlem siden ${formatMemberSince(profile.member_since)}`
                : 'Ny bruger'}
            </Text>
            <View style={styles.badges}>
              <Pill label="Fan" />
              {ownedCount > 0 && (
                <Pill label={`Ejer af ${ownedCount} fællesskab${ownedCount > 1 ? 'er' : ''}`} />
              )}
            </View>
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <OutlineButton title="Rediger profil" onPress={handleEditProfile} />
        </View>
      </Card>

      {/* Owned Communities */}
      {ownerCommunities.length > 0 && (
        <SectionCard title="MINE FÆLLESSKABER (EJER)" icon="crown" styles={styles}>
          {ownerCommunities.map((community) => (
            <ProfileRow
              key={community.id}
              icon="people"
              title={community.name}
              subtitle={`${community.memberCount} medlemmer • Du er ejer`}
              onPress={() => navigateToCommunity(community.id)}
              styles={styles}
            />
          ))}
        </SectionCard>
      )}

      {/* Member Communities */}
      {memberCommunities.length > 0 && (
        <SectionCard title="MEDLEM AF FÆLLESSKABER" styles={styles}>
          {memberCommunities.map((community) => (
            <ProfileRow
              key={community.id}
              icon="people"
              title={community.name}
              subtitle={`${community.memberCount} medlemmer • ${
                community.type === 'fan_faction' ? 'Fan fraktion' : 'Du er medlem'
              }`}
              onPress={() => navigateToCommunity(community.id)}
              styles={styles}
            />
          ))}
        </SectionCard>
      )}

      {/* Upcoming Events */}
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>
            DINE KOMMENDE EVENTS
          </Text>
          <Pressable
            style={[styles.newEventButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => (navigation as any).navigate('CreateNewEvent')}
          >
            <Ionicons name="add" size={16} color={theme.colors.bg.card} />
            <Text style={[styles.newEventButtonText, { color: theme.colors.bg.card }]}>Ny</Text>
          </Pressable>
        </View>
        {upcomingItems.length > 0 ? (
          upcomingItems.map((item) => (
            <ProfileRow
              key={item.id}
              icon={getItemIcon(item.targetType)}
              title={item.title}
              subtitle={formatEventDate(item.date)}
              onPress={() => navigateToItem(item)}
              styles={styles}
            />
          ))
        ) : (
          <Text style={[styles.emptyText, { color: theme.colors.text.secondary }]}>
            Ingen kommende events
          </Text>
        )}
      </Card>

      {/* Settings */}
      <Card style={{ marginBottom: spacing.md }}>
        <ProfileRow
          icon="notifications"
          title="Notifikationer"
          onPress={() => Alert.alert('Notifikationer', 'Kommer snart!')}
          styles={styles}
        />
        <ProfileRow
          icon="settings"
          title="Generelle indstillinger"
          onPress={() => Alert.alert('Indstillinger', 'Kommer snart!')}
          styles={styles}
        />
        <ProfileRow
          icon="help-circle"
          title="Hjælp & support"
          onPress={() => Alert.alert('Hjælp', 'Kontakt support@fcnfans.dk')}
          styles={styles}
        />
        <ProfileRow icon="log-out" title="Log ud" onPress={handleLogout} isLogout styles={styles} />
      </Card>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.text.secondary }]}>
          FCN Fans App v1.0.0
        </Text>
        <Text style={[styles.footerText, { color: theme.colors.text.secondary }]}>
          Lavet af fans, til fans ❤️🔵
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    headerSection: {
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.sm,
    },
    headerTitle: {
      fontSize: theme.typography.h1.fontSize,
      fontWeight: theme.typography.h1.fontWeight as any,
      marginBottom: spacing.xs,
    },
    headerSubtitle: {
      fontSize: theme.typography.body.fontSize,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl * 2,
    },
    loadingText: {
      marginTop: spacing.md,
      fontSize: theme.typography.body.fontSize,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl * 2,
      paddingHorizontal: spacing.lg,
    },
    emptyTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '600',
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    emptySubtext: {
      fontSize: theme.typography.body.fontSize,
      textAlign: 'center',
    },
    profileSummary: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      position: 'relative',
      marginRight: spacing.md,
    },
    avatarOverlay: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: theme.spacing[6],
      height: theme.spacing[6],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.layout.borderWidth * 2,
    },
    avatarBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
    },
    bannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    bannerText: {
      marginLeft: spacing.sm,
      flex: 1,
    },
    bannerTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
    },
    bannerSubtitle: {
      fontSize: theme.typography.small.fontSize,
      marginTop: theme.spacing[0],
    },
    bannerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: theme.radius.sm,
      gap: theme.spacing[1],
    },
    bannerButtonText: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '700',
    },
    profileSubtext: {
      fontSize: theme.typography.body.fontSize,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    badges: {
      flexDirection: 'row',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: theme.layout.borderWidth,
    },
    rowIcon: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 16,
    },
    rowSubtitle: {
      fontSize: 14,
      marginTop: theme.spacing[0],
    },
    footer: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    footerText: {
      fontSize: 12,
      textAlign: 'center',
    },
    newEventButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: theme.radius.sm,
      gap: theme.spacing[1],
    },
    newEventButtonText: {
      fontSize: theme.typography.small.fontSize,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: theme.typography.body.fontSize,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
