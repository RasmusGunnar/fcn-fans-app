import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { StadiumParticipantRow } from '../components/stadium/StadiumParticipantRow';
import { Button, Card, Text } from '../components/ui';
import { fetchMatchCheckInSnapshot } from '../services/checkins';
import { createOrGetDirectConversation } from '../services/messagesApi';
import {
  getStadiumLiveCount,
  getStadiumLiveParticipants,
  getStadiumLivePreferences,
  getStadiumReactions,
  sendStadiumReaction,
  updateStadiumLivePreferences,
} from '../services/stadiumLiveApi';
import { confirmAndSubmitReport } from '../services/reporting';
import { navigateToDirectMessageConversation } from '../navigation/navigationRef';
import { useStadiumReactions } from '../state/StadiumReactionContext';
import { useTheme } from '../theme';
import type {
  StadiumLivePreferences,
  StadiumParticipant,
  StadiumReaction,
  StadiumReactionType,
} from '../types/stadiumLive';
import {
  getRemainingCooldownSeconds,
  getStadiumReactionCopy,
  sanitizeStadiumSection,
  splitStadiumParticipants,
} from '../utils/stadiumLive';

type StadiumLiveRoute = RouteProp<
  { StadiumLive: { eventId: string; highlightReactionId?: string } },
  'StadiumLive'
>;

type ParticipantSection = { title: string; data: StadiumParticipant[] };

export default function StadiumLiveScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<StadiumLiveRoute>();
  const { user } = useAuth();
  const { latestReaction, revision } = useStadiumReactions();
  const theme = useTheme();
  const styles = createStyles(theme);
  const eventId = route.params.eventId;

  const [preferences, setPreferences] = useState<StadiumLivePreferences | null>(null);
  const [sectionDraft, setSectionDraft] = useState('');
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [participants, setParticipants] = useState<StadiumParticipant[]>([]);
  const [participantCursor, setParticipantCursor] = useState<{
    rank: number;
    userId: string;
  } | null>(null);
  const [reactions, setReactions] = useState<StadiumReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [cooldownByUserId, setCooldownByUserId] = useState<Record<string, string>>({});

  const load = useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!eventId || !user?.id) return;
      if (options?.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const [nextPreferences, snapshot, count] = await Promise.all([
          getStadiumLivePreferences(),
          fetchMatchCheckInSnapshot({ matchId: eventId, currentUserId: user.id }),
          getStadiumLiveCount(eventId),
        ]);
        setPreferences(nextPreferences);
        setSectionDraft(nextPreferences.sectionLabel ?? '');
        setIsCheckedIn(snapshot.isCheckedIn);
        setVisibleCount(count);

        if (snapshot.isCheckedIn && nextPreferences.isVisible) {
          const [participantPage, recentReactions] = await Promise.all([
            getStadiumLiveParticipants({ eventId, limit: 50 }),
            getStadiumReactions({ eventId, limit: 30 }),
          ]);
          setParticipants(participantPage.participants);
          setParticipantCursor(participantPage.nextCursor);
          setReactions(recentReactions);
        } else {
          setParticipants([]);
          setParticipantCursor(null);
          setReactions([]);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : 'Stadion Live kunne ikke hentes.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [eventId, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  React.useEffect(() => {
    if (revision > 0 && latestReaction?.eventId === eventId) {
      void load({ refresh: true });
    }
  }, [eventId, latestReaction?.eventId, load, revision]);

  const savePreferences = useCallback(
    async (
      next: Pick<StadiumLivePreferences, 'isVisible' | 'reactionsEnabled' | 'sectionLabel'>,
    ) => {
      if (savingPreferences) return;
      setSavingPreferences(true);
      try {
        const saved = await updateStadiumLivePreferences(next);
        setPreferences(saved);
        setSectionDraft(saved.sectionLabel ?? '');
        await load({ refresh: true });
      } catch (saveError) {
        Alert.alert(
          'Kunne ikke gemme',
          saveError instanceof Error ? saveError.message : 'Prøv igen.',
        );
      } finally {
        setSavingPreferences(false);
      }
    },
    [load, savingPreferences],
  );

  const handleSendReaction = useCallback(
    async (
      participant: StadiumParticipant,
      reactionType: StadiumReactionType,
      replyToReactionId?: string,
    ) => {
      if (pendingUserId || !participant.canReact) return;
      const cooldownSeconds = getRemainingCooldownSeconds(
        cooldownByUserId[participant.userId] ?? null,
      );
      if (cooldownSeconds > 0) {
        Alert.alert('Vent lidt', `Du kan reagere til denne fan igen om ${cooldownSeconds} sek.`);
        return;
      }

      setPendingUserId(participant.userId);
      try {
        const sent = await sendStadiumReaction({
          eventId,
          recipientUserId: participant.userId,
          reactionType,
          replyToReactionId,
        });
        setCooldownByUserId((current) => ({
          ...current,
          [participant.userId]: sent.cooldownUntil,
        }));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
        await load({ refresh: true });
      } catch (sendError) {
        Alert.alert(
          'Kunne ikke sende reaktion',
          sendError instanceof Error ? sendError.message : 'Prøv igen.',
        );
      } finally {
        setPendingUserId(null);
      }
    },
    [cooldownByUserId, eventId, load, pendingUserId],
  );

  const handleMessage = useCallback(async (participant: StadiumParticipant) => {
    try {
      const conversationId = await createOrGetDirectConversation(participant.userId);
      navigateToDirectMessageConversation(conversationId);
    } catch (messageError) {
      Alert.alert(
        'Samtalen kunne ikke åbnes',
        messageError instanceof Error ? messageError.message : 'Prøv igen.',
      );
    }
  }, []);

  const handleReply = useCallback(
    (reaction: StadiumReaction) => {
      const participant: StadiumParticipant = {
        userId: reaction.actorId,
        displayName: reaction.actorDisplayName,
        username: reaction.actorUsername,
        avatarUrl: reaction.actorAvatarUrl,
        fanLevelKey: null,
        sectionLabel: null,
        sameCommunity: false,
        reactedRecently: true,
        canReact: true,
        canMessage: true,
        rankBucket: 1,
      };
      void handleSendReaction(participant, 'high_five', reaction.id);
    },
    [handleSendReaction],
  );

  const loadMore = useCallback(async () => {
    if (!participantCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getStadiumLiveParticipants({
        eventId,
        cursor: participantCursor,
        limit: 50,
      });
      setParticipants((current) => {
        const byId = new Map(current.map((participant) => [participant.userId, participant]));
        page.participants.forEach((participant) => byId.set(participant.userId, participant));
        return Array.from(byId.values()).sort(
          (left, right) =>
            left.rankBucket - right.rankBucket || left.userId.localeCompare(right.userId),
        );
      });
      setParticipantCursor(page.nextCursor);
    } catch (pageError) {
      setError(pageError instanceof Error ? pageError.message : 'Flere fans kunne ikke hentes.');
    } finally {
      setLoadingMore(false);
    }
  }, [eventId, loadingMore, participantCursor]);

  const sections = useMemo<ParticipantSection[]>(() => {
    const split = splitStadiumParticipants(participants);
    return [
      ...(split.relevant.length > 0
        ? [{ title: 'Folk fra dine fællesskaber', data: split.relevant }]
        : []),
      ...(split.others.length > 0 ? [{ title: 'Andre på stadion', data: split.others }] : []),
    ];
  }, [participants]);

  const receivedReactions = useMemo(
    () => reactions.filter((reaction) => reaction.received).slice(0, 5),
    [reactions],
  );

  const renderPreferences = () => (
    <Card style={styles.preferencesCard}>
      <View style={styles.preferenceHeader}>
        <View style={styles.preferenceIcon}>
          <Ionicons name="radio-outline" size={22} color={theme.colors.primary} />
        </View>
        <View style={styles.preferenceCopy}>
          <Text variant="bodyBold">Bliv synlig for andre fans</Text>
          <Text variant="small" color="secondary">
            Kun checkede-in fans kan se dig og sende hurtige reaktioner.
          </Text>
        </View>
        <Switch
          value={preferences?.isVisible ?? false}
          disabled={!isCheckedIn || savingPreferences}
          onValueChange={(isVisible) =>
            void savePreferences({
              isVisible,
              reactionsEnabled: preferences?.reactionsEnabled ?? true,
              sectionLabel: sanitizeStadiumSection(sectionDraft),
            })
          }
          trackColor={{ false: theme.colors.border.default, true: theme.colors.primary }}
          thumbColor={theme.colors.bg.card}
        />
      </View>

      {preferences?.isVisible ? (
        <>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text variant="bodyBold">Tillad stadionreaktioner</Text>
              <Text variant="small" color="secondary">
                Andre synlige fans kan sende dig reaktioner under kampen.
              </Text>
            </View>
            <Switch
              value={preferences.reactionsEnabled}
              disabled={savingPreferences}
              onValueChange={(reactionsEnabled) =>
                void savePreferences({
                  isVisible: true,
                  reactionsEnabled,
                  sectionLabel: sanitizeStadiumSection(sectionDraft),
                })
              }
              trackColor={{ false: theme.colors.border.default, true: theme.colors.primary }}
              thumbColor={theme.colors.bg.card}
            />
          </View>
          <View style={styles.sectionField}>
            <Text variant="small" color="secondary">
              Afsnit eller tribune (valgfrit)
            </Text>
            <TextInput
              value={sectionDraft}
              onChangeText={(value) => setSectionDraft(value.slice(0, 30))}
              onEndEditing={() =>
                void savePreferences({
                  isVisible: true,
                  reactionsEnabled: preferences.reactionsEnabled,
                  sectionLabel: sanitizeStadiumSection(sectionDraft),
                })
              }
              maxLength={30}
              placeholder="Fx A-tribunen"
              placeholderTextColor={theme.colors.text.muted}
              style={styles.sectionInput}
            />
          </View>
        </>
      ) : null}
    </Card>
  );

  const ListHeader = (
    <View style={styles.listHeader}>
      {renderPreferences()}
      {!isCheckedIn ? (
        <Card style={styles.stateCard}>
          <Ionicons name="location-outline" size={32} color={theme.colors.primary} />
          <Text variant="h3" style={styles.centerText}>
            Check ind til kampen
          </Text>
          <Text color="secondary" style={styles.centerText}>
            Check ind til kampen for at se, hvem der er på stadion.
          </Text>
        </Card>
      ) : preferences?.isVisible && receivedReactions.length > 0 ? (
        <View style={styles.recentSection}>
          <Text variant="h3">Seneste til dig</Text>
          {receivedReactions.map((reaction) => (
            <View
              key={reaction.id}
              style={[
                styles.reactionRow,
                route.params.highlightReactionId === reaction.id
                  ? styles.reactionHighlighted
                  : null,
              ]}
            >
              <View style={styles.reactionCopy}>
                <Text variant="bodyBold">{getStadiumReactionCopy(reaction)}</Text>
                <Text variant="small" color="secondary">
                  {new Date(reaction.createdAt).toLocaleTimeString('da-DK', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {!reaction.replied ? (
                <Pressable onPress={() => handleReply(reaction)} style={styles.replyButton}>
                  <Text variant="small" style={styles.replyText}>
                    🙌 Tilbage
                  </Text>
                </Pressable>
              ) : (
                <Text variant="small" color="success">
                  Svaret
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}
      {error ? (
        <Card style={styles.errorCard}>
          <Text color="error">{error}</Text>
          <Button title="Prøv igen" variant="outline" size="sm" onPress={() => void load()} />
        </Card>
      ) : null}
      {isCheckedIn && preferences?.isVisible && participants.length === 0 && !loading && !error ? (
        <Card style={styles.stateCard}>
          <Ionicons name="people-outline" size={32} color={theme.colors.primary} />
          <Text variant="h3">Ingen andre synlige fans endnu</Text>
          <Text color="secondary" style={styles.centerText}>
            Listen opdateres, når andre checkede-in fans vælger at være synlige.
          </Text>
        </Card>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Gå tilbage"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.inverse} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text variant="h2" color="inverse">
            På stadion
          </Text>
          <Text variant="small" color="inverse" style={styles.headerSubtitle}>
            {visibleCount} {visibleCount === 1 ? 'fan er' : 'fans er'} synlig
            {visibleCount === 1 ? '' : 'e'} her
          </Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(participant) => participant.userId}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} />
        }
        ListHeaderComponent={ListHeader}
        ListFooterComponent={loadingMore ? <Text color="secondary">Henter flere fans…</Text> : null}
        renderSectionHeader={({ section }) => (
          <Text variant="h3" style={styles.sectionTitle}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <StadiumParticipantRow
            participant={item}
            pending={pendingUserId === item.userId}
            cooldownSeconds={getRemainingCooldownSeconds(cooldownByUserId[item.userId] ?? null)}
            onProfile={() => navigation.navigate('PublicProfile', { userId: item.userId })}
            onMessage={() => void handleMessage(item)}
            onReport={() =>
              confirmAndSubmitReport({
                reporterUserId: user?.id,
                targetType: 'user',
                targetId: item.userId,
                subjectLabel: 'bruger',
              })
            }
            onReact={(reactionType) => void handleSendReaction(item, reactionType)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg.default },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      backgroundColor: theme.colors.primary,
    },
    backButton: { padding: theme.spacing[1] },
    headerCopy: { flex: 1, minWidth: 0 },
    headerSubtitle: { opacity: 0.86 },
    content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
    listHeader: { gap: theme.spacing[4], marginBottom: theme.spacing[4] },
    preferencesCard: { gap: theme.spacing[3] },
    preferenceHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
    preferenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      paddingTop: theme.spacing[3],
      borderTopWidth: theme.layout.borderHairline,
      borderTopColor: theme.colors.border.default,
    },
    preferenceIcon: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
    },
    preferenceCopy: { flex: 1, minWidth: 0, gap: theme.spacing[1] },
    sectionField: { gap: theme.spacing[1] },
    sectionInput: {
      minHeight: theme.spacing[11],
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing[3],
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.bg.surface,
    },
    stateCard: { alignItems: 'center', gap: theme.spacing[2], paddingVertical: theme.spacing[6] },
    centerText: { textAlign: 'center' },
    recentSection: { gap: theme.spacing[2] },
    reactionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      padding: theme.spacing[3],
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.surface,
    },
    reactionHighlighted: {
      borderColor: theme.colors.primary,
      borderWidth: theme.layout.borderWidth,
    },
    reactionCopy: { flex: 1, minWidth: 0, gap: theme.spacing[1] },
    replyButton: {
      minHeight: theme.spacing[9],
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
    },
    replyText: { color: theme.colors.primary, fontWeight: '700' },
    errorCard: { gap: theme.spacing[3] },
    sectionTitle: { marginBottom: theme.spacing[2], marginTop: theme.spacing[2] },
    separator: { height: theme.spacing[2] },
  });
