import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { ActorSelector } from '../components/ActorSelector';
import { FeedTargetSelector } from '../components/FeedTargetSelector';
import { NewsComposer } from '../components/NewsComposer';
import { PollComposer } from '../components/PollComposer';
import { PostComposer } from '../components/PostComposer';
import { canPostAsCommunity, getMyCommunityRoles } from '../services/rbac';
import { useFeed } from '../state/FeedContext';
import { useTheme } from '../theme';
import { Actor } from '../types/news';
import { resolveProfileDisplayName } from '../utils/actor';

interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
  initialContentType?: ContentType;
  initialFeedTargets?: string[];
  initialActor?: Actor;
}

type ContentType = null | 'post' | 'news' | 'poll' | 'event';

export default function CreateSheet({
  visible,
  onClose,
  initialContentType,
  initialFeedTargets,
  initialActor,
}: CreateSheetProps) {
  const insets = useSafeAreaInsets();
  const { fetchPosts, profileMap, communityMap } = useFeed();
  const { user } = useAuth();
  const theme = useTheme();

  const [contentType, setContentType] = useState<ContentType>(null);
  const [actor, setActor] = useState<Actor>({
    type: 'user',
    id: user?.id || '',
    name: resolveProfileDisplayName(profileMap, user?.id, user?.email || undefined),
  });
  const [feedTargets, setFeedTargets] = useState<string[]>(['home']);
  const [showPostSettings, setShowPostSettings] = useState(false);
  const [showNewsSettings, setShowNewsSettings] = useState(false);
  const [showPollSettings, setShowPollSettings] = useState(false);
  const [canCreateAdminContent, setCanCreateAdminContent] = useState(false);

  // Reset actor when user changes
  useEffect(() => {
    if (user) {
      setActor({
        type: 'user',
        id: user.id,
        name: resolveProfileDisplayName(profileMap, user.id, user.email || undefined),
      });
    }
  }, [user, profileMap]);

  useEffect(() => {
    let mounted = true;

    const loadAdminCapability = async () => {
      if (!user?.id) {
        if (mounted) setCanCreateAdminContent(false);
        return;
      }

      try {
        const roleMap = await getMyCommunityRoles();
        const hasAdminCap = Object.values(roleMap).some((role) => canPostAsCommunity(role));
        if (mounted) {
          setCanCreateAdminContent(hasAdminCap);
        }
      } catch {
        if (mounted) {
          setCanCreateAdminContent(false);
        }
      }
    };

    loadAdminCapability();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (visible) {
      if (initialContentType !== undefined) {
        setContentType(initialContentType);
      }
      if (Array.isArray(initialFeedTargets) && initialFeedTargets.length > 0) {
        setFeedTargets(initialFeedTargets);
      }
      if (initialActor) {
        setActor(initialActor);
      }
      setShowPostSettings(false);
      setShowNewsSettings(false);
      setShowPollSettings(false);
    }
  }, [visible, initialContentType, initialFeedTargets, initialActor]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setContentType(null);
      setFeedTargets(['home']);
      setShowPostSettings(false);
      setShowNewsSettings(false);
      setShowPollSettings(false);
      if (user) {
        setActor({
          type: 'user',
          id: user.id,
          name: resolveProfileDisplayName(profileMap, user.id, user.email || undefined),
        });
      }
    }
  }, [visible, user, profileMap]);

  const handleNewsSuccess = () => {
    fetchPosts();
    onClose();
  };

  const handlePostSuccess = () => {
    onClose();
  };

  const handlePollSuccess = async () => {
    await fetchPosts();
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  const includesHome = feedTargets.includes('home');
  const communityTargetCount = feedTargets.filter((target) =>
    target.startsWith('community:'),
  ).length;
  const singleCommunityTarget =
    !includesHome && communityTargetCount === 1
      ? feedTargets.find((target) => target.startsWith('community:'))
      : null;
  const singleCommunityName = singleCommunityTarget
    ? communityMap[singleCommunityTarget.replace('community:', '')]
    : null;
  const newsAccent = theme.colors.state.success;
  const pollAccent = theme.colors.state?.info ?? theme.colors.primary;
  const feedTargetsSummary =
    includesHome && communityTargetCount > 0
      ? `Vises i Home + ${communityTargetCount} mere`
      : includesHome
        ? 'Vises i Home'
        : communityTargetCount === 1
          ? singleCommunityName
            ? `Vises i ${singleCommunityName}`
            : 'Vises i valgt fællesskab'
          : `Vises i ${communityTargetCount} fællesskaber`;

  const styles = makeStyles(theme);

  const renderContent = () => {
    if (contentType === null) {
      return (
        <View style={styles.choiceContainer}>
          <Pressable
            style={({ pressed }) => [styles.choiceCard, pressed && styles.choiceCardPressed]}
            onPress={() => setContentType('post')}
          >
            <View style={[styles.choiceIcon, { backgroundColor: theme.colors.pill.red.bg }]}>
              <Ionicons name="create" size={26} color={theme.colors.primary} />
            </View>
            <Text style={styles.choiceTitle}>Opret opslag</Text>
            <Text style={styles.choiceDescription}>Del tanker og billeder med fællesskabet.</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.choiceCard, pressed && styles.choiceCardPressed]}
            onPress={() => setContentType('news')}
          >
            <View style={[styles.choiceIcon, { backgroundColor: theme.colors.pill.green.bg }]}>
              <Ionicons name="link" size={26} color={theme.colors.state.success} />
            </View>
            <Text style={styles.choiceTitle}>Del nyhed</Text>
            <Text style={styles.choiceDescription}>Del en artikel via link med preview.</Text>
          </Pressable>

          {canCreateAdminContent && (
            <>
              <Pressable
                style={({ pressed }) => [styles.choiceCard, pressed && styles.choiceCardPressed]}
                onPress={() => setContentType('poll')}
              >
                <View style={[styles.choiceIcon, { backgroundColor: theme.colors.bg.subtle }]}>
                  <Ionicons name="bar-chart" size={26} color={theme.colors.state.info} />
                </View>
                <Text style={styles.choiceTitle}>Poll</Text>
                <Text style={styles.choiceDescription}>Opret en afstemning.</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.choiceCard, pressed && styles.choiceCardPressed]}
                onPress={() => setContentType('event')}
              >
                <View
                  style={[styles.choiceIcon, { backgroundColor: theme.colors.badges.eventSoftBg }]}
                >
                  <Ionicons name="calendar-clear" size={26} color={theme.colors.badges.event} />
                </View>
                <Text style={styles.choiceTitle}>Event</Text>
                <Text style={styles.choiceDescription}>Planlæg et event.</Text>
              </Pressable>
            </>
          )}
        </View>
      );
    }

    if (contentType === 'post') {
      return (
        <>
          <View style={styles.postSettingsBlock}>
            <Pressable
              style={[
                styles.settingsSummaryCard,
                showPostSettings && styles.settingsSummaryCardExpanded,
              ]}
              onPress={() => setShowPostSettings((prev) => !prev)}
            >
              <View style={styles.settingsSummaryBody}>
                <Text style={styles.settingsSummaryTitle}>Opslå som {actor.name}</Text>
                <Text style={styles.settingsSummarySubtitle}>{feedTargetsSummary}</Text>
              </View>
              <View
                style={[
                  styles.settingsSummaryActionWrap,
                  showPostSettings && styles.settingsSummaryActionWrapExpanded,
                ]}
              >
                <Text style={styles.settingsSummaryAction}>
                  {showPostSettings ? 'Skjul' : 'Rediger'}
                </Text>
                <Ionicons
                  name={showPostSettings ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={theme.colors.text.secondary}
                />
              </View>
            </Pressable>

            {showPostSettings && (
              <View style={styles.postSettingsExpanded}>
                <ActorSelector selectedActor={actor} onSelectActor={setActor} />
                <FeedTargetSelector selectedTargets={feedTargets} onChange={setFeedTargets} />
              </View>
            )}
          </View>
          <View style={styles.postComposerSection}>
            <PostComposer actor={actor} feedTargets={feedTargets} onSuccess={handlePostSuccess} />
          </View>
        </>
      );
    }

    if (contentType === 'news') {
      return (
        <>
          <View style={styles.newsSettingsBlock}>
            <Pressable
              style={[
                styles.newsSettingsSummaryCard,
                showNewsSettings && styles.newsSettingsSummaryCardExpanded,
              ]}
              onPress={() => setShowNewsSettings((prev) => !prev)}
            >
              <View style={styles.settingsSummaryBody}>
                <Text style={styles.newsSettingsSummaryTitle}>Opslå som {actor.name}</Text>
                <Text style={styles.newsSettingsSummarySubtitle}>Deles som nyhed</Text>
              </View>
              <View
                style={[
                  styles.newsSettingsActionWrap,
                  showNewsSettings && styles.newsSettingsActionWrapExpanded,
                ]}
              >
                <Text style={styles.newsSettingsAction}>
                  {showNewsSettings ? 'Skjul' : 'Rediger'}
                </Text>
                <Ionicons
                  name={showNewsSettings ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={newsAccent}
                />
              </View>
            </Pressable>

            {showNewsSettings && (
              <View style={styles.newsSettingsExpanded}>
                <ActorSelector
                  selectedActor={actor}
                  onSelectActor={setActor}
                  accentColor={newsAccent}
                />
              </View>
            )}
          </View>
          <NewsComposer actor={actor} onSuccess={handleNewsSuccess} />
        </>
      );
    }

    if (contentType === 'poll') {
      return (
        <>
          <View style={styles.pollSettingsBlock}>
            <Pressable
              style={[
                styles.pollSettingsSummaryCard,
                showPollSettings && styles.pollSettingsSummaryCardExpanded,
              ]}
              onPress={() => setShowPollSettings((prev) => !prev)}
            >
              <View style={styles.settingsSummaryBody}>
                <Text style={styles.settingsSummaryTitle}>Opslå som {actor.name}</Text>
                <Text style={styles.settingsSummarySubtitle}>{feedTargetsSummary}</Text>
              </View>
              <View
                style={[
                  styles.pollSettingsActionWrap,
                  showPollSettings && styles.pollSettingsActionWrapExpanded,
                ]}
              >
                <Text style={styles.pollSettingsAction}>
                  {showPollSettings ? 'Skjul' : 'Rediger'}
                </Text>
                <Ionicons
                  name={showPollSettings ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={pollAccent}
                />
              </View>
            </Pressable>

            {showPollSettings && (
              <View style={styles.pollSettingsExpanded}>
                <ActorSelector
                  selectedActor={actor}
                  onSelectActor={setActor}
                  accentColor={pollAccent}
                />
                <FeedTargetSelector
                  selectedTargets={feedTargets}
                  onChange={setFeedTargets}
                  accentColor={pollAccent}
                />
              </View>
            )}
          </View>
          <PollComposer actor={actor} feedTargets={feedTargets} onSuccess={handlePollSuccess} />
        </>
      );
    }

    return (
      <View style={styles.placeholderSection}>
        <View
          style={[styles.placeholderIcon, { backgroundColor: theme.colors.badges.eventSoftBg }]}
        >
          <Ionicons name="calendar" size={28} color={theme.colors.badges.event} />
        </View>
        <Text style={styles.placeholderTitle}>Event-oprettelse kommer snart</Text>
        <Text style={styles.placeholderDescription}>
          Event-oprettelse bliver tilføjet i en kommende version.
        </Text>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={theme.colors.text.primary} />
          </Pressable>
          <Text style={styles.title}>
            {contentType === null
              ? 'Hvad vil du oprette?'
              : contentType === 'post'
                ? 'Opret opslag'
                : contentType === 'news'
                  ? 'Del nyhed'
                  : contentType === 'poll'
                    ? 'Opret afstemning'
                    : 'Opret event'}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={[
              styles.contentContainer,
              { paddingBottom: insets.bottom + theme.spacing[6] },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            {renderContent()}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    keyboardContainer: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[6],
      paddingBottom: theme.spacing[2],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.card,
    },
    closeButton: {
      padding: theme.spacing[1],
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    content: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    contentContainer: {
      flexGrow: 1,
    },
    postSettingsBlock: {
      paddingHorizontal: theme.spacing[3],
      paddingTop: theme.spacing[2],
      paddingBottom: theme.spacing[1],
    },
    postSettingsExpanded: {
      marginTop: theme.spacing[2],
      paddingTop: theme.spacing[1],
      gap: theme.spacing[1],
    },
    settingsSummaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.pill.red.bg,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      marginBottom: theme.spacing[2],
    },
    settingsSummaryCardExpanded: {
      backgroundColor: theme.colors.bg.card,
      borderColor: theme.colors.border.default,
    },
    settingsSummaryBody: {
      flex: 1,
      paddingRight: theme.spacing[3],
    },
    settingsSummaryTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    settingsSummarySubtitle: {
      marginTop: theme.spacing[0],
      fontSize: 12,
      color: theme.colors.text.secondary,
    },
    settingsSummaryActionWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.card,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    settingsSummaryActionWrapExpanded: {
      backgroundColor: theme.colors.bg.elevated,
      borderColor: theme.colors.border.default,
    },
    settingsSummaryAction: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    postComposerSection: {
      backgroundColor: theme.colors.bg.subtle,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
    },
    newsSettingsBlock: {
      paddingHorizontal: theme.spacing[3],
      paddingTop: theme.spacing[2],
      paddingBottom: theme.spacing[1],
    },
    newsSettingsExpanded: {
      marginTop: theme.spacing[2],
      paddingTop: theme.spacing[1],
    },
    newsSettingsSummaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.pill.green.bg,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.pill.green.border,
      marginBottom: theme.spacing[2],
    },
    newsSettingsSummaryCardExpanded: {
      backgroundColor: theme.colors.bg.card,
      borderColor: theme.colors.border.default,
    },
    newsSettingsSummaryTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    newsSettingsSummarySubtitle: {
      marginTop: theme.spacing[0],
      fontSize: 12,
      color: theme.colors.text.secondary,
    },
    newsSettingsActionWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.card,
      borderWidth: 1,
      borderColor: theme.colors.pill.green.border,
    },
    newsSettingsActionWrapExpanded: {
      backgroundColor: theme.colors.bg.elevated,
      borderColor: theme.colors.border.default,
    },
    newsSettingsAction: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.state.success,
    },
    pollSettingsBlock: {
      paddingHorizontal: theme.spacing[3],
      paddingTop: theme.spacing[2],
      paddingBottom: theme.spacing[1],
    },
    pollSettingsExpanded: {
      marginTop: theme.spacing[2],
      paddingTop: theme.spacing[1],
      gap: theme.spacing[1],
    },
    pollSettingsSummaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.bg.subtle,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      marginBottom: theme.spacing[2],
    },
    pollSettingsSummaryCardExpanded: {
      backgroundColor: theme.colors.bg.card,
      borderColor: theme.colors.border.default,
    },
    pollSettingsActionWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.card,
      borderWidth: 1,
      borderColor: theme.colors.state.info,
    },
    pollSettingsActionWrapExpanded: {
      backgroundColor: theme.colors.bg.elevated,
      borderColor: theme.colors.state.info,
    },
    pollSettingsAction: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.state.info,
    },
    choiceContainer: {
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[2],
      paddingBottom: theme.spacing[6],
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: theme.spacing[3],
    },
    choiceCard: {
      backgroundColor: theme.colors.bg.card,
      width: '48%',
      minHeight: 144,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2] + theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    choiceCardPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.985 }],
    },
    choiceIcon: {
      width: 58,
      height: 58,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.default,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing[1] + theme.spacing[0],
    },
    choiceTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[0],
      textAlign: 'center',
    },
    choiceDescription: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      textAlign: 'center',
      lineHeight: 16,
    },
    infoText: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      backgroundColor: theme.colors.bg.card,
      padding: theme.spacing[4],
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      marginBottom: theme.spacing[4],
    },
    placeholderSection: {
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[8],
      alignItems: 'center',
    },
    placeholderIcon: {
      width: 72,
      height: 72,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing[4],
    },
    placeholderTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
      textAlign: 'center',
    },
    placeholderDescription: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 320,
    },
  });
