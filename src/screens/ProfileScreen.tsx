import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { OutlineButton } from '../components/ui/OutlineButton';
import { colors, spacing } from '../theme';
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

function SectionCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {icon && <Ionicons name={icon as any} size={16} color={colors.fcnRed} />}
      </View>
      {children}
    </Card>
  );
}

function ProfileRow({ icon, title, subtitle, onPress, isLogout }: { icon: string; title: string; subtitle?: string; onPress?: () => void; isLogout?: boolean }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.rowIcon, isLogout && { backgroundColor: colors.fcnRed }]}>
        <Ionicons name={icon as any} size={16} color={isLogout ? colors.card : colors.card} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, isLogout && { color: colors.fcnRed }]}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownerCommunities, setOwnerCommunities] = useState<MyCommunity[]>([]);
  const [memberCommunities, setMemberCommunities] = useState<MyCommunity[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([]);
  const [ownedCount, setOwnedCount] = useState(0);

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
    }, [])
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
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Min Profil</Text>
          <Text style={styles.headerSubtitle}>Indstillinger & fællesskaber</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="person-circle-outline" size={64} color={colors.subtext} />
          <Text style={styles.emptyTitle}>Du skal være logget ind</Text>
          <Text style={styles.emptySubtext}>Log ind for at se din profil</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Min Profil</Text>
          <Text style={styles.headerSubtitle}>Indstillinger & fællesskaber</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
          <Text style={styles.loadingText}>Henter profil...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 24 }}
    >
      {/* Simple header without red background */}
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>Min Profil</Text>
        <Text style={styles.headerSubtitle}>Indstillinger & fællesskaber</Text>
      </View>

      {/* Profile Card */}
      <Card style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        <View style={styles.profileSummary}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={colors.card} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {profile?.display_name || user?.email || 'Fan'}
            </Text>
            <Text style={styles.profileSubtext}>
              {profile?.member_since
                ? `Medlem siden ${formatMemberSince(profile.member_since)}`
                : 'Ny bruger'}
            </Text>
            <View style={styles.badges}>
              <Pill label="Fan" />
              {ownedCount > 0 && (
                <Pill
                  label={`Ejer af ${ownedCount} fællesskab${ownedCount > 1 ? 'er' : ''}`}
                />
              )}
            </View>
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <OutlineButton
            title="Rediger profil"
            icon="pencil"
            onPress={handleEditProfile}
          />
        </View>
      </Card>

      {/* Owned Communities */}
      {ownerCommunities.length > 0 && (
        <SectionCard title="MINE FÆLLESSKABER (EJER)" icon="crown">
          {ownerCommunities.map((community) => (
            <ProfileRow
              key={community.id}
              icon="people"
              title={community.name}
              subtitle={`${community.memberCount} medlemmer • Du er ejer`}
              onPress={() => navigateToCommunity(community.id)}
            />
          ))}
        </SectionCard>
      )}

      {/* Member Communities */}
      {memberCommunities.length > 0 && (
        <SectionCard title="MEDLEM AF FÆLLESSKABER">
          {memberCommunities.map((community) => (
            <ProfileRow
              key={community.id}
              icon="people"
              title={community.name}
              subtitle={`${community.memberCount} medlemmer • ${
                community.type === 'fan_faction' ? 'Fan fraktion' : 'Du er medlem'
              }`}
              onPress={() => navigateToCommunity(community.id)}
            />
          ))}
        </SectionCard>
      )}

      {/* Upcoming Events */}
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DINE KOMMENDE EVENTS</Text>
          <Pressable
            style={styles.newEventButton}
            onPress={() => (navigation as any).navigate('CreateNewEvent')}
          >
            <Ionicons name="add" size={16} color={colors.card} />
            <Text style={styles.newEventButtonText}>Ny</Text>
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
            />
          ))
        ) : (
          <Text style={styles.emptyText}>Ingen kommende events</Text>
        )}
      </Card>

      {/* Settings */}
      <Card style={{ marginBottom: spacing.md }}>
        <ProfileRow
          icon="notifications"
          title="Notifikationer"
          onPress={() => Alert.alert('Notifikationer', 'Kommer snart!')}
        />
        <ProfileRow
          icon="settings"
          title="Generelle indstillinger"
          onPress={() => Alert.alert('Indstillinger', 'Kommer snart!')}
        />
        <ProfileRow
          icon="help-circle"
          title="Hjælp & support"
          onPress={() => Alert.alert('Hjælp', 'Kontakt support@fcnfans.dk')}
        />
        <ProfileRow
          icon="log-out"
          title="Log ud"
          onPress={handleLogout}
          isLogout
        />
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>FCN Fans App v1.0.0</Text>
        <Text style={styles.footerText}>Lavet af fans, til fans ❤️🔵</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerSection: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.subtext,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.subtext,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
  },
  profileSummary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  profileSubtext: {
    fontSize: 14,
    color: colors.subtext,
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
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  footerText: {
    fontSize: 12,
    color: colors.subtext,
    textAlign: 'center',
  },
  newEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fcnRed,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    gap: 4,
  },
  newEventButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.card,
  },
  emptyText: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
