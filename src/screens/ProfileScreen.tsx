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
  Switch,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { FanBarometerCard } from '../components/fan/FanBarometerCard';
import { FanLevelBadge } from '../components/fan/FanLevelBadge';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Pill } from '../components/ui/Pill';
import { getSafeFanLevelKey } from '../lib/fanLevel';
import { getNextFanLevel } from '../lib/fanbarometer';
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
  sendManualTestPush,
  syncPushNotifications,
  type PushUiStatus,
} from '../lib/notifications';
import {
  DEFAULT_PUSH_PREFERENCES,
  getPushPreferences,
  savePushPreferences,
  type PushPreferences,
} from '../services/pushPreferencesApi';
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
import { getUnreadNotificationsCount } from '../services/notificationsApi';
import { normalizeDisplayNameToUsername } from '../utils/username';

function isUsernameConflictError(error: any): boolean {
  const message = String(error?.message ?? '').toLowerCase();
  const details = String(error?.details ?? '').toLowerCase();

  return (
    error?.code === '23505' &&
    (message.includes('profiles_username_unique_idx') ||
      details.includes('profiles_username_unique_idx') ||
      message.includes('username') ||
      details.includes('username'))
  );
}

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
  const [pushTestLoading, setPushTestLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushUiStatus>('not_setup');
  const [pushPermissionStatus, setPushPermissionStatus] = useState<string>('undetermined');
  const [pushTokenPreview, setPushTokenPreview] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushPreferences, setPushPreferences] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [pushPreferencesLoading, setPushPreferencesLoading] = useState(false);
  const [pushPreferenceSavingKey, setPushPreferenceSavingKey] = useState<
    | keyof Pick<
        PushPreferences,
        'communityActivityEnabled' | 'matchdayCheckinEnabled' | 'mentionsEnabled' | 'repliesEnabled'
      >
    | null
  >(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const fanLevel = getSafeFanLevelKey(profile?.fan_level_key);
  const debugScore = 180;
  const debugProgress = 0.53;
  const debugNextLevel = getNextFanLevel(fanLevel);
  const debugPointsToNext = debugNextLevel ? 70 : null;

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
        setPushMessage('Push er klar på denne enhed.');
      } else if (snapshot.status === 'denied') {
        setPushMessage('Push er afvist på denne enhed. Åbn indstillinger for at aktivere igen.');
      } else if (snapshot.status === 'not_setup') {
        setPushMessage('Aktivér push for at modtage notifikationer på denne enhed.');
      } else {
        setPushMessage('Kunne ikke læse push-status lige nu.');
      }
    } finally {
      setPushLoading(false);
    }
  }, [user?.id]);

  const loadPushPreferences = useCallback(async () => {
    if (!user?.id) return;

    setPushPreferencesLoading(true);
    try {
      const preferences = await getPushPreferences(user.id);
      setPushPreferences(preferences);
    } finally {
      setPushPreferencesLoading(false);
    }
  }, [user?.id]);

  const loadNotificationUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setNotificationUnreadCount(0);
      return;
    }

    const count = await getUnreadNotificationsCount(user.id);
    setNotificationUnreadCount(count);
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadPushStatus();
  }, [loadPushStatus]);

  useEffect(() => {
    loadPushPreferences();
  }, [loadPushPreferences]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      loadPushStatus();
      loadPushPreferences();
      loadNotificationUnreadCount();
    }, [loadData, loadPushStatus, loadPushPreferences, loadNotificationUnreadCount]),
  );

  const handlePushSetup = async () => {
    if (!user?.id) return;

    setPushLoading(true);
    try {
      const result = await syncPushNotifications(user.id);
      setPushStatus(result.status);
      setPushPermissionStatus(result.permissionStatus);
      setPushTokenPreview(
        result.token ? `${result.token.slice(0, 10)}...${result.token.slice(-6)}` : null,
      );

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

  const handleSendPushTest = async () => {
    if (!user?.id) return;

    setPushTestLoading(true);
    try {
      const result = await sendManualTestPush(user.id);
      if (result.status === 'sent') {
        setPushMessage('Test-push sendt. Tjek denne enhed for notifikationen.');
      } else {
        setPushMessage(result.errorMessage ?? 'Test-push kunne ikke sendes.');
      }
      await loadPushStatus();
    } catch (e: any) {
      console.warn('[ProfileScreen] Push test failed:', e);
      setPushMessage(e?.message ?? 'Test-push kunne ikke sendes.');
    } finally {
      setPushTestLoading(false);
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

  const handleTogglePushPreference = async (
    key: keyof Pick<
      PushPreferences,
      'communityActivityEnabled' | 'matchdayCheckinEnabled' | 'mentionsEnabled' | 'repliesEnabled'
    >,
    value: boolean,
  ) => {
    if (!user?.id) return;

    const previous = pushPreferences;
    setPushPreferenceSavingKey(key);
    setPushPreferences((current) => ({ ...current, [key]: value }));

    try {
      const updated = await savePushPreferences(user.id, { [key]: value });
      setPushPreferences(updated);
    } catch (error) {
      console.warn('[ProfileScreen] savePushPreferences failed:', error);
      setPushPreferences(previous);
      Alert.alert('Fejl', 'Kunne ikke gemme push-indstillingen. Prøv igen.');
    } finally {
      setPushPreferenceSavingKey(null);
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
    const normalizedUsername = normalizeDisplayNameToUsername(trimmedName);
    const avatarUrl = avatarUrlInput;

    if (!trimmedName) {
      Alert.alert('Mangler kaldenavn', 'Indtast et kaldenavn for at fortsætte.');
      return;
    }

    if (!avatarUrl) {
      Alert.alert('Mangler profilbillede', 'Upload et profilbillede for at fortsætte.');
      return;
    }

    if (!normalizedUsername) {
      Alert.alert(
        'Ugyldigt kaldenavn',
        'Kaldenavnet skal indeholde mindst ét bogstav eller tal for at kunne bruges i mentions.',
      );
      return;
    }

    setSavingProfile(true);
    try {
      await ensureProfile(user.id);

      const payload = {
        display_name: trimmedName,
        username: normalizedUsername,
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
        if (isUsernameConflictError(updateError)) {
          Alert.alert('Kaldenavn optaget', 'Det kaldenavn er allerede i brug.');
          return;
        }

        if (updateError) {
          console.warn('[ProfileScreen] Profile update failed, trying upsert:', updateError);
        }
        const { data: upserted, error: upsertError } = await supabase
          .from('profiles')
          .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
          .select('id')
          .maybeSingle();

        if (upsertError || !upserted) {
          if (isUsernameConflictError(upsertError)) {
            Alert.alert('Kaldenavn optaget', 'Det kaldenavn er allerede i brug.');
            return;
          }

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
                username: normalizedUsername,
                avatar_url: avatarUrl,
                member_since: null,
                fan_level_key: profile?.fan_level_key ?? fanLevel,
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
            <View
              style={[
                styles.bannerIconShell,
                {
                  backgroundColor: theme.colors.bg.subtle,
                  borderColor: theme.colors.border.default,
                },
              ]}
            >
              <Ionicons name="camera" size={20} color={theme.colors.primary} />
            </View>
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
            style={[
              styles.bannerButton,
              {
                backgroundColor: 'transparent',
                borderColor: theme.colors.border.default,
              },
            ]}
            onPress={handleUploadAvatar}
          >
            <Text style={[styles.bannerButtonText, { color: theme.colors.primary }]}>
              {profile?.avatar_url ? 'Skift' : 'Upload'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
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
      <Card style={styles.profileCard}>
        <View style={styles.profileSummary}>
          <Pressable onPress={handleUploadAvatar} disabled={uploadingAvatar}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: theme.colors.bg.canvas,
                  borderColor: theme.colors.border.default,
                },
              ]}
            >
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
                  {
                    backgroundColor: theme.colors.bg.surface,
                    borderColor: theme.colors.border.default,
                  },
                ]}
              >
                <Ionicons name="camera" size={18} color={theme.colors.primary} />
              </View>
            </View>
          </Pressable>
          <View style={styles.profileInfo}>
            <View style={styles.profileIdentityBlock}>
              <Text style={[styles.profileName, { color: theme.colors.text.primary }]}>
                {profile?.display_name || user?.email || 'Fan'}
              </Text>
              <Text style={[styles.profileSubtext, { color: theme.colors.text.secondary }]}>
                {profile?.member_since
                  ? `Medlem siden ${formatMemberSince(profile.member_since)}`
                  : 'Ny bruger'}
              </Text>
            </View>
            <View style={styles.badges}>
              <FanLevelBadge level={fanLevel} size="md" labelMode="short" />
              {ownedCount > 0 && (
                <Badge
                  label={`Ejer af ${ownedCount} fællesskab${ownedCount > 1 ? 'er' : ''}`}
                  variant="brandSoft"
                  size="sm"
                />
              )}
            </View>
            <View
              style={[
                styles.profileEditor,
                {
                  borderColor: theme.colors.border.light,
                },
              ]}
            >
              <Text style={[styles.profileLabel, { color: theme.colors.text.secondary }]}>
                Kaldenavn
              </Text>
              <TextInput
                value={displayNameInput}
                onChangeText={setDisplayNameInput}
                placeholder="Dit kaldenavn"
                placeholderTextColor={theme.colors.text.secondary}
                style={[
                  styles.profileInput,
                  {
                    borderColor: theme.colors.border.light,
                    color: theme.colors.text.primary,
                    backgroundColor: 'transparent',
                  },
                ]}
                editable={!savingProfile}
              />
              <Text style={[styles.profileHint, { color: theme.colors.text.secondary }]}>
                Dit kaldenavn bruges også til @mentions.
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.profileActions}>
          <OutlineButton
            title={savingProfile ? 'Gemmer...' : 'Gem & fortsæt'}
            onPress={handleSaveProfile}
            disabled={savingProfile}
            fullWidth={false}
          />
        </View>
      </Card>

      <FanBarometerCard
        level={fanLevel}
        score={debugScore}
        progress={debugProgress}
        nextLevel={debugNextLevel}
        pointsToNext={debugPointsToNext}
        state="ready"
      />

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
          <Ionicons
            name="notifications"
            size={theme.components.icon.size.sm}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.pushStatusRow}>
          <View style={styles.pushStatusCopy}>
            <Text style={[styles.pushStatusTitle, { color: theme.colors.text.primary }]}>
              Push-status: {getPushStatusLabel()}
            </Text>
            <Text style={[styles.pushStatusBody, { color: theme.colors.text.secondary }]}>
              {pushMessage ?? 'Aktivér push og send en test til denne enhed.'}
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
              title={pushLoading ? 'Tjekker...' : 'Aktivér push'}
              onPress={handlePushSetup}
              disabled={pushLoading || pushTestLoading}
            />
          </View>
          {pushStatus === 'enabled' ? (
            <View style={styles.pushActionButton}>
              <OutlineButton
                title={pushTestLoading ? 'Sender test...' : 'Send test-push'}
                onPress={handleSendPushTest}
                disabled={pushLoading || pushTestLoading}
              />
            </View>
          ) : null}
          {pushStatus === 'denied' ? (
            <View style={styles.pushActionButton}>
              <OutlineButton title="Åbn indstillinger" onPress={handleOpenDeviceSettings} />
            </View>
          ) : null}
        </View>
        <View style={[styles.pushPreferencesList, { borderTopColor: theme.colors.border.default }]}>
          <View style={styles.pushPreferenceRow}>
            <View style={styles.pushPreferenceCopy}>
              <Text style={[styles.pushPreferenceTitle, { color: theme.colors.text.primary }]}>
                {'Mentions'}
              </Text>
              <Text style={[styles.pushPreferenceBody, { color: theme.colors.text.secondary }]}>
                {'N\u00E5r nogen n\u00E6vner dig i et opslag eller en kommentar.'}
              </Text>
            </View>
            <Switch
              value={pushPreferences.mentionsEnabled}
              onValueChange={(value) => handleTogglePushPreference('mentionsEnabled', value)}
              disabled={pushPreferencesLoading || pushPreferenceSavingKey === 'mentionsEnabled'}
              trackColor={{
                false: theme.colors.border.default,
                true: theme.colors.primary,
              }}
              thumbColor={theme.colors.bg.card}
            />
          </View>

          <View style={styles.pushPreferenceRow}>
            <View style={styles.pushPreferenceCopy}>
              <Text style={[styles.pushPreferenceTitle, { color: theme.colors.text.primary }]}>
                {'Svar p\u00E5 mit indhold'}
              </Text>
              <Text style={[styles.pushPreferenceBody, { color: theme.colors.text.secondary }]}>
                {
                  'N\u00E5r andre kommenterer p\u00E5 dit opslag eller svarer p\u00E5 din kommentar.'
                }
              </Text>
            </View>
            <Switch
              value={pushPreferences.repliesEnabled}
              onValueChange={(value) => handleTogglePushPreference('repliesEnabled', value)}
              disabled={pushPreferencesLoading || pushPreferenceSavingKey === 'repliesEnabled'}
              trackColor={{
                false: theme.colors.border.default,
                true: theme.colors.primary,
              }}
              thumbColor={theme.colors.bg.card}
            />
          </View>

          <View style={styles.pushPreferenceRow}>
            <View style={styles.pushPreferenceCopy}>
              <Text style={[styles.pushPreferenceTitle, { color: theme.colors.text.primary }]}>
                {'Kampdag check-in'}
              </Text>
              <Text style={[styles.pushPreferenceBody, { color: theme.colors.text.secondary }]}>
                {'Husk at tjekke ind, hvis du er p\u00E5 stadion til FCN-kampen.'}
              </Text>
            </View>
            <Switch
              value={pushPreferences.matchdayCheckinEnabled}
              onValueChange={(value) => handleTogglePushPreference('matchdayCheckinEnabled', value)}
              disabled={
                pushPreferencesLoading || pushPreferenceSavingKey === 'matchdayCheckinEnabled'
              }
              trackColor={{
                false: theme.colors.border.default,
                true: theme.colors.primary,
              }}
              thumbColor={theme.colors.bg.card}
            />
          </View>

          <View style={styles.pushPreferenceRow}>
            <View style={styles.pushPreferenceCopy}>
              <Text style={[styles.pushPreferenceTitle, { color: theme.colors.text.primary }]}>
                {'F\u00E6llesskabsaktivitet'}
              </Text>
              <Text style={[styles.pushPreferenceBody, { color: theme.colors.text.secondary }]}>
                {'Nye opslag og afstemninger i f\u00E6llesskaber, du er medlem af.'}
              </Text>
            </View>
            <Switch
              value={pushPreferences.communityActivityEnabled}
              onValueChange={(value) =>
                handleTogglePushPreference('communityActivityEnabled', value)
              }
              disabled={
                pushPreferencesLoading || pushPreferenceSavingKey === 'communityActivityEnabled'
              }
              trackColor={{
                false: theme.colors.border.default,
                true: theme.colors.primary,
              }}
              thumbColor={theme.colors.bg.card}
            />
          </View>
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <ProfileRow
          icon="notifications"
          title="Notifikationer"
          subtitle={
            notificationUnreadCount > 0
              ? `${notificationUnreadCount} ulæst${notificationUnreadCount === 1 ? '' : 'e'}`
              : 'Se dine mentions og svar'
          }
          onPress={() => (navigation as any).navigate('Notifications')}
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
      alignItems: 'flex-start',
      gap: theme.spacing[3],
    },
    avatar: {
      position: 'relative',
      padding: theme.spacing[1],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
    },
    avatarOverlay: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: theme.spacing[5] + theme.layout.borderWidth,
      height: theme.spacing[5] + theme.layout.borderWidth,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.layout.borderHairline,
    },
    profileCard: {
      marginBottom: spacing.md,
      backgroundColor: theme.colors.bg.surface,
    },
    avatarBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.spacing[2],
      paddingHorizontal: spacing.md,
      gap: theme.spacing[3],
    },
    bannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    bannerIconShell: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.layout.borderHairline,
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
      borderWidth: theme.layout.borderHairline,
      gap: theme.spacing[1],
    },
    bannerButtonText: {
      fontSize: theme.typography.small.fontSize,
      fontWeight: '600',
    },
    profileInfo: {
      flex: 1,
      gap: theme.spacing[2],
    },
    profileIdentityBlock: {
      gap: theme.spacing[0],
    },
    profileName: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '700',
    },
    profileLabel: {
      fontSize: theme.typography.small.fontSize,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: theme.spacing[1],
    },
    profileEditor: {
      borderRadius: theme.radius.md,
      backgroundColor: 'transparent',
      marginTop: theme.spacing[1],
    },
    profileInput: {
      borderWidth: theme.layout.borderHairline,
      borderRadius: theme.radius.md,
      paddingVertical: theme.spacing[1] + theme.layout.borderHairline,
      paddingHorizontal: theme.spacing[3],
      fontSize: 14,
    },
    profileHint: {
      fontSize: theme.typography.caption.fontSize,
      marginTop: theme.spacing[1],
    },
    profileSubtext: {
      fontSize: theme.typography.caption.fontSize,
      marginTop: theme.spacing[0],
    },
    badges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      flexWrap: 'wrap',
      marginTop: theme.spacing[1],
    },
    profileActions: {
      marginTop: theme.spacing[5],
      paddingTop: theme.spacing[3],
      borderTopWidth: theme.layout.borderHairline,
      borderTopColor: theme.colors.border.light,
      alignItems: 'flex-end',
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
    pushPreferencesList: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: theme.layout.borderHairline,
      gap: spacing.sm,
    },
    pushPreferenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
    },
    pushPreferenceCopy: {
      flex: 1,
      paddingRight: theme.spacing[2],
    },
    pushPreferenceTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      marginBottom: theme.spacing[0],
    },
    pushPreferenceBody: {
      fontSize: theme.typography.small.fontSize,
      lineHeight: 18,
    },
    emptyText: {
      fontSize: theme.typography.body.fontSize,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
