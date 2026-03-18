import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { OutlineButton } from '../components/ui/OutlineButton';
import { spacing } from '../theme';
import { useTheme } from '../theme';
import { uploadAvatar } from '../lib/uploadAvatar';
import { getPublicUrl } from '../lib/storageUrl';
import { Avatar } from '../components/Avatar';
import { supabase } from '../lib/supabase';
import { ensureProfile } from '../lib/profile';
import {
  getPushStatusSnapshot,
  syncPushNotifications,
  type PushUiStatus,
} from '../lib/notifications';
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
  const { user, signOut, isAppAdmin } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownerCommunities, setOwnerCommunities] = useState<MyCommunity[]>([]);
  const [memberCommunities, setMemberCommunities] = useState<MyCommunity[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([]);
  const [ownedCount, setOwnedCount] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [avatarUrlInput, setAvatarUrlInput] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushUiStatus>('not_setup');
  const [pushPermissionStatus, setPushPermissionStatus] = useState<string>('undetermined');
  const [pushTokenPreview, setPushTokenPreview] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
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
      const profileResult = results[0].value;
      setProfile(profileResult);
      setDisplayNameInput((prev) =>
        prev.trim().length === 0 ? profileResult?.display_name || user?.email || '' : prev,
      );
      if (profileResult?.avatar_url) {
        const existingAvatar = profileResult.avatar_url;
        const resolvedAvatar = existingAvatar.startsWith('http')
          ? existingAvatar
          : getPublicUrl('avatars', existingAvatar);
        setAvatarUrlInput((prev) => (prev === null ? resolvedAvatar : prev));
      }
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
  }, [user?.id, user?.email]);

  const loadPushStatus = useCallback(async () => {
    if (!user?.id) return;

    setPushLoading(true);
    try {
      const snapshot = await getPushStatusSnapshot(user.id);
      setPushStatus(snapshot.status);
      setPushPermissionStatus(snapshot.permissionStatus);
      setPushTokenPreview(snapshot.savedTokenPreview);

      if (snapshot.status === 'enabled') {
        setPushMessage('Push er klar til nye opslag, svar og events.');
      } else if (snapshot.status === 'denied') {
        setPushMessage('Push er afvist på denne enhed. Åbn indstillinger for at aktivere igen.');
      } else if (snapshot.status === 'not_setup') {
        setPushMessage('Aktivér push for at få besked om nye opslag, svar og events.');
      } else {
        setPushMessage('Kunne ikke læse push-status lige nu.');
      }
    } finally {
      setPushLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadPushStatus();
  }, [loadPushStatus]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      loadPushStatus();
    }, [loadData, loadPushStatus]),
  );

  const handlePushSetup = async () => {
    if (!user?.id) return;

    setPushLoading(true);
    try {
      const result = await syncPushNotifications(user.id);
      setPushStatus(result.status);
      setPushPermissionStatus(result.permissionStatus);
      setPushTokenPreview(result.token ? `${result.token.slice(0, 10)}…${result.token.slice(-6)}` : null);

      if (result.status === 'enabled') {
        setPushMessage('Push-notifikationer er nu aktiveret på denne enhed.');
      } else if (result.status === 'denied') {
        setPushMessage('Push blev afvist. Giv adgang i systemindstillinger for at aktivere.');
      } else if (result.status === 'error') {
        setPushMessage(result.errorMessage ?? 'Push-opsætning fejlede.');
      } else {
        setPushMessage('Push er endnu ikke sat fuldt op.');
      }
    } catch (e: any) {
      console.error('[ProfileScreen] Push setup failed:', e);
      setPushStatus('error');
      setPushMessage(e?.message ?? 'Push-opsætning fejlede.');
    } finally {
      setPushLoading(false);
    }
  };

  const handleOpenDeviceSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (e) {
      console.warn('[ProfileScreen] Could not open settings:', e);
      Alert.alert('Fejl', 'Kunne ikke åbne enhedens indstillinger.');
    }
  };

  const getPushStatusLabel = () => {
    if (pushStatus === 'enabled') return 'Aktiveret';
    if (pushStatus === 'denied') return 'Afvist';
    if (pushStatus === 'error') return 'Fejl';
    return 'Ikke sat op';
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const handleDevResetLogin = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' } as any);
      (navigation as any).reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      console.warn('[ProfileScreen] Dev reset login failed:', e);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    const trimmedName = displayNameInput.trim();
    const avatarUrl = avatarUrlInput;

    if (!trimmedName) {
      Alert.alert('Mangler kaldenavn', 'Indtast et kaldenavn for at fortsætte.');
      return;
    }

    if (!avatarUrl) {
      Alert.alert('Mangler profilbillede', 'Upload et profilbillede for at fortsætte.');
      return;
    }

    setSavingProfile(true);
    try {
      await ensureProfile(user.id);

      const payload = {
        display_name: trimmedName,
        avatar_url: avatarUrl,
        onboarding_complete: true,
      };

      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)
        .select('id')
        .maybeSingle();

      if (updateError || !updated) {
        if (updateError) {
          console.warn('[ProfileScreen] Profile update failed, trying upsert:', updateError);
        }
        const { data: upserted, error: upsertError } = await supabase
          .from('profiles')
          .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
          .select('id')
          .maybeSingle();

        if (upsertError || !upserted) {
          console.warn('[ProfileScreen] Profile upsert failed:', upsertError);
          Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
          return;
        }
      }

      const refreshed = await fetchMyProfile(user.id);
      if (refreshed) {
        setProfile(refreshed);
        const refreshedAvatar = refreshed.avatar_url;
        const resolvedAvatar = refreshedAvatar
          ? refreshedAvatar.startsWith('http')
            ? refreshedAvatar
            : getPublicUrl('avatars', refreshedAvatar)
          : null;
        setAvatarUrlInput(resolvedAvatar ?? avatarUrlInput);
      } else {
        setProfile((prev) =>
          prev
            ? { ...prev, ...payload }
            : {
                id: user.id,
                display_name: trimmedName,
                avatar_url: avatarUrl,
                member_since: null,
                onboarding_complete: true,
              },
        );
      }
      Alert.alert('Profil gemt', 'Din profil er nu opdateret.');
    } catch (e) {
      console.warn('[ProfileScreen] Unexpected save error:', e);
      Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUploadAvatar = async () => {
    if (!user?.id) return;

    setUploadingAvatar(true);
    const avatarPath = await uploadAvatar(user.id);
    setUploadingAvatar(false);

    if (avatarPath) {
      const publicUrl = avatarPath.startsWith('http')
        ? avatarPath
        : getPublicUrl('avatars', avatarPath);
      if (!publicUrl) {
        Alert.alert('Fejl', 'Kunne ikke hente billed-URL. Prøv igen.');
        return;
      }
      setAvatarUrlInput(publicUrl);
      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : null));
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
            <Text style={[styles.profileLabel, { color: theme.colors.text.secondary }]}>Kaldenavn</Text>
            <TextInput
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="Dit kaldenavn"
              placeholderTextColor={theme.colors.text.secondary}
              style={[
                styles.profileInput,
                {
                  borderColor: theme.colors.border.default,
                  color: theme.colors.text.primary,
                  backgroundColor: theme.colors.bg.elevated,
                },
              ]}
              editable={!savingProfile}
            />
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
          <OutlineButton
            title={savingProfile ? 'Gemmer...' : 'Gem & fortsæt'}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          />
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
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>
            NOTIFIKATIONER
          </Text>
          <Ionicons name="notifications" size={theme.components.icon.size.sm} color={theme.colors.primary} />
        </View>
        <View style={styles.pushStatusRow}>
          <View style={styles.pushStatusCopy}>
            <Text style={[styles.pushStatusTitle, { color: theme.colors.text.primary }]}>
              Push-status: {getPushStatusLabel()}
            </Text>
            <Text style={[styles.pushStatusBody, { color: theme.colors.text.secondary }]}>
              {pushMessage ?? 'Få besked om nye opslag, svar og kommende events.'}
            </Text>
            <Text style={[styles.pushMeta, { color: theme.colors.text.secondary }]}>
              Tilladelse: {pushPermissionStatus}
            </Text>
            {pushTokenPreview ? (
              <Text style={[styles.pushMeta, { color: theme.colors.text.secondary }]}>
                Token: {pushTokenPreview}
              </Text>
            ) : null}
          </View>
          <Pill label={getPushStatusLabel()} />
        </View>
        <View style={styles.pushActionRow}>
          <View style={styles.pushActionButton}>
            <OutlineButton
              title={pushLoading ? 'Tjekker...' : 'Aktivér / test push'}
              onPress={handlePushSetup}
              disabled={pushLoading}
            />
          </View>
          {pushStatus === 'denied' ? (
            <View style={styles.pushActionButton}>
              <OutlineButton title="Åbn indstillinger" onPress={handleOpenDeviceSettings} />
            </View>
          ) : null}
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <ProfileRow
          icon="notifications"
          title="Notifikationer"
          subtitle="Status og opsætning vises ovenfor"
          onPress={handlePushSetup}
          styles={styles}
        />
        <ProfileRow
          icon="settings"
          title="Generelle indstillinger"
          onPress={() => Alert.alert('Indstillinger', 'Kommer snart!')}
          styles={styles}
        />
        {isAppAdmin && (
          <ProfileRow
            icon="shield-checkmark"
            title="Fanfraktion-anmodninger"
            subtitle="Administrér afventende anmodninger"
            onPress={() => (navigation as any).navigate('AdminFanFactionRequests')}
            styles={styles}
          />
        )}
        <ProfileRow
          icon="help-circle"
          title="Hjælp & support"
          onPress={() => Alert.alert('Hjælp', 'Kontakt support@fcnfans.dk')}
          styles={styles}
        />
        {__DEV__ && (
          <ProfileRow
            icon="refresh"
            title="Nulstil login"
            onPress={handleDevResetLogin}
            styles={styles}
          />
        )}
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
    profileLabel: {
      fontSize: 12,
      fontWeight: '600',
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    profileInput: {
      borderWidth: 1,
      borderRadius: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: 14,
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
    pushStatusRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
      marginBottom: spacing.sm,
    },
    pushStatusCopy: {
      flex: 1,
    },
    pushStatusTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '700',
      marginBottom: theme.spacing[1],
    },
    pushStatusBody: {
      fontSize: theme.typography.body.fontSize,
      marginBottom: theme.spacing[2],
    },
    pushMeta: {
      fontSize: theme.typography.small.fontSize,
      marginTop: theme.spacing[0],
    },
    pushActionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    pushActionButton: {
      flex: 1,
    },
    emptyText: {
      fontSize: theme.typography.body.fontSize,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
