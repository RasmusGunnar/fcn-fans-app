import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { ActorSelector } from '../components/ActorSelector';
import { FeedTargetSelector } from '../components/FeedTargetSelector';
import { NewsComposer } from '../components/NewsComposer';
import { PostComposer } from '../components/PostComposer';
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

type ContentType = null | 'post' | 'news';

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
    }
  }, [visible, initialContentType, initialFeedTargets, initialActor]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setContentType(null);
      setFeedTargets(['home']);
      setShowPostSettings(false);
      setShowNewsSettings(false);
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

  const handleClose = () => {
    onClose();
  };

  const includesHome = feedTargets.includes('home');
  const communityTargetCount = feedTargets.filter((target) => target.startsWith('community:')).length;
  const singleCommunityTarget =
    !includesHome && communityTargetCount === 1
      ? feedTargets.find((target) => target.startsWith('community:'))
      : null;
  const singleCommunityName = singleCommunityTarget
    ? communityMap[singleCommunityTarget.replace('community:', '')]
    : null;
  const newsAccent = theme.colors.state.success;
  const feedTargetsSummary = includesHome && communityTargetCount > 0
    ? `Vises i Home + ${communityTargetCount} mere`
    : includesHome
      ? 'Vises i Home'
      : communityTargetCount === 1
        ? singleCommunityName
          ? `Vises i ${singleCommunityName}`
          : 'Vises i valgt fællesskab'
        : `Vises i ${communityTargetCount} fællesskaber`;

  const styles = makeStyles(theme);

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
                : 'Del nyhed'}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.content}>
          {contentType === null ? (
            // Step 1: Choose content type
            <View style={styles.choiceContainer}>
              <Pressable style={styles.choiceCard} onPress={() => setContentType('post')}>
                <View style={styles.choiceIcon}>
                  <Ionicons name="create" size={40} color={theme.colors.primary} />
                </View>
                <Text style={styles.choiceTitle}>Opret opslag</Text>
                <Text style={styles.choiceDescription}>
                  Del dine tanker med fællesskabet. Tilføj billede hvis du vil.
                </Text>
              </Pressable>

              <Pressable style={styles.choiceCard} onPress={() => setContentType('news')}>
                <View style={styles.choiceIcon}>
                  <Ionicons name="link" size={40} color={theme.colors.primary} />
                </View>
                <Text style={styles.choiceTitle}>Del nyhed</Text>
                <Text style={styles.choiceDescription}>
                  Del en interessant artikel eller nyhed via URL med preview.
                </Text>
              </Pressable>
            </View>
          ) : contentType === 'post' ? (
            // Step 2: Post composer (community posting coming later)
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
                <PostComposer
                  actor={actor}
                  feedTargets={feedTargets}
                  onSuccess={handlePostSuccess}
                />
              </View>
            </>
          ) : (
            // Step 2: News composer with actor selector
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
          )}
        </ScrollView>
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
    choiceContainer: {
      padding: theme.spacing[6],
      gap: theme.spacing[6],
    },
    choiceCard: {
      backgroundColor: theme.colors.bg.card,
      padding: theme.spacing[8],
      borderRadius: theme.radius.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    choiceIcon: {
      width: 80,
      height: 80,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.default,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing[4],
    },
    choiceTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    choiceDescription: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
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
  });
