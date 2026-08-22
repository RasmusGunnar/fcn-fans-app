import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { StadiumParticipantRow } from '../components/stadium/StadiumParticipantRow';
import { Button, Card, Text } from '../components/ui';
import { navigateToDirectMessageConversation } from '../navigation/navigationRef';
import { APP_TAB_BAR_FAB_OVERFLOW } from '../navigation/tabBarMetrics';
import { createOrGetDirectConversation } from '../services/messagesApi';
import {
  getStadiumLiveParticipants,
  getStadiumLivePreferences,
  getStadiumReactions,
  sendStadiumReaction,
  updateStadiumLivePreferences,
} from '../services/stadiumLiveApi';
import { confirmAndSubmitReport } from '../services/reporting';
import { useStadiumReactions } from '../state/StadiumReactionContext';
import { useMatchdayState } from '../state/MatchdayStateContext';
import { useTheme } from '../theme';
import type {
  StadiumLivePreferences,
  StadiumParticipant,
  StadiumReaction,
  StadiumReactionType,
} from '../types/stadiumLive';
import {
  getRemainingCooldownSeconds,
  getStadiumListBottomPadding,
  getStadiumReactionCopy,
  sanitizeStadiumSection,
  splitStadiumParticipants,
} from '../utils/stadiumLive';

type StadiumLiveRoute = RouteProp<
  { StadiumLive: { eventId: string; highlightReactionId?: string } },
  'StadiumLive'
>;

type ParticipantSection = { title: string; data: StadiumParticipant[] };

const REACTION_SENT_FEEDBACK_MS = 1600;
const COOLDOWN_TICK_MS = 1_000;

export default function StadiumLiveScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<StadiumLiveRoute>();
  const { user } = useAuth();
  const { latestReaction, revision } = useStadiumReactions();
  const theme = useTheme();
  const styles = createStyles(theme);
  const tabBarHeight = useBottomTabBarHeight();
  const listBottomPadding = getStadiumListBottomPadding(
    tabBarHeight,
    APP_TAB_BAR_FAB_OVERFLOW + theme.spacing[1],
  );
  const eventId = route.params.eventId;
  const matchdayState = useMatchdayState(eventId);
  const refreshMatchdayState = matchdayState.refresh;
  const checkInToMatch = matchdayState.checkIn;
  const checkOutOfMatch = matchdayState.checkOut;

  const [preferences, setPreferences] = useState<StadiumLivePreferences | null>(null);
  const [sectionDraft, setSectionDraft] = useState('');
  const [participants, setParticipants] = useState<StadiumParticipant[]>([]);
  const [participantCursor, setParticipantCursor] = useState<{
    rank: number;
    userId: string;
  } | null>(null);
  const [reactions, setReactions] = useState<StadiumReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [changingParticipation, setChangingParticipation] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [sentReaction, setSentReaction] = useState<{
    userId: string;
    reactionType: StadiumReactionType;
  } | null>(null);
  const [cooldownByUserId, setCooldownByUserId] = useState<Record<string, string>>({});
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now());
  const [sectionEditorVisible, setSectionEditorVisible] = useState(false);
  const sectionEditorVisibleRef = React.useRef(false);

  React.useEffect(() => {
    if (!sentReaction) return;
    const timeout = setTimeout(() => setSentReaction(null), REACTION_SENT_FEEDBACK_MS);
    return () => clearTimeout(timeout);
  }, [sentReaction]);

  const hasActiveCooldowns = Object.keys(cooldownByUserId).length > 0;
  React.useEffect(() => {
    if (!hasActiveCooldowns) return;

    const tickCooldowns = () => {
      const now = Date.now();
      setCooldownNowMs(now);
      setCooldownByUserId((current) => {
        const entries = Object.entries(current);
        const activeEntries = entries.filter(
          ([, cooldownUntil]) => getRemainingCooldownSeconds(cooldownUntil, now) > 0,
        );
        return activeEntries.length === entries.length
          ? current
          : Object.fromEntries(activeEntries);
      });
    };

    tickCooldowns();
    const interval = setInterval(tickCooldowns, COOLDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, [hasActiveCooldowns]);

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
        const [nextPreferences, snapshot] = await Promise.all([
          getStadiumLivePreferences(),
          refreshMatchdayState(),
        ]);
        setPreferences(nextPreferences);
        if (!sectionEditorVisibleRef.current) {
          setSectionDraft(nextPreferences.sectionLabel ?? '');
        }

        if (snapshot.isCheckedIn && snapshot.stadiumLiveOpen) {
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
    [eventId, refreshMatchdayState, user?.id],
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
        setSectionDraft(preferences?.sectionLabel ?? '');
        Alert.alert(
          'Kunne ikke gemme',
          saveError instanceof Error ? saveError.message : 'Prøv igen.',
        );
      } finally {
        setSavingPreferences(false);
      }
    },
    [load, preferences?.sectionLabel, savingPreferences],
  );

  const handleCheckIn = useCallback(async () => {
    if (changingParticipation) return;
    setChangingParticipation(true);
    setError(null);
    try {
      await checkInToMatch();
      await load({ refresh: true });
    } catch (checkInError) {
      setError(
        checkInError instanceof Error
          ? checkInError.message
          : 'Kunne ikke tjekke dig ind. Prøv igen.',
      );
    } finally {
      setChangingParticipation(false);
    }
  }, [changingParticipation, checkInToMatch, load]);

  const handleToggleReactions = useCallback(() => {
    if (!preferences || savingPreferences || sectionEditorVisible) return;
    void savePreferences({
      isVisible: true,
      reactionsEnabled: !preferences.reactionsEnabled,
      sectionLabel: sanitizeStadiumSection(sectionDraft),
    });
  }, [preferences, savePreferences, savingPreferences, sectionDraft, sectionEditorVisible]);

  const handleSectionEditingEnd = useCallback(() => {
    sectionEditorVisibleRef.current = false;
    setSectionEditorVisible(false);
    if (!preferences) return;
    const sectionLabel = sanitizeStadiumSection(sectionDraft);
    setSectionDraft(sectionLabel ?? '');
    if (sectionLabel === preferences.sectionLabel) return;
    void savePreferences({
      isVisible: true,
      reactionsEnabled: preferences.reactionsEnabled,
      sectionLabel,
    });
  }, [preferences, savePreferences, sectionDraft]);

  const handleOpenSectionEditor = useCallback(() => {
    sectionEditorVisibleRef.current = true;
    setSectionEditorVisible(true);
  }, []);

  const handleCheckOut = useCallback(async () => {
    if (changingParticipation) return;
    setChangingParticipation(true);
    setError(null);
    try {
      await checkOutOfMatch();
      setParticipants([]);
      setParticipantCursor(null);
      setReactions([]);
    } catch (checkOutError) {
      setError(
        checkOutError instanceof Error
          ? checkOutError.message
          : 'Kunne ikke tjekke dig ud. Prøv igen.',
      );
    } finally {
      setChangingParticipation(false);
    }
  }, [changingParticipation, checkOutOfMatch]);

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

      setSentReaction(null);
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
        setCooldownNowMs(Date.now());
        setSentReaction({ userId: participant.userId, reactionType });
        setPendingUserId(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
        void load({ refresh: true });
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
    () => reactions.filter((reaction) => reaction.received).slice(0, 2),
    [reactions],
  );

  const preferencesReady = preferences !== null;
  const reactionControlDisabled = !preferencesReady || savingPreferences || sectionEditorVisible;
  const participantCountCopy = `${matchdayState.participantCount} ${
    matchdayState.participantCount === 1 ? 'fan er her' : 'fans er her'
  }`;

  const renderCheckedInStatus = () => (
    <Card style={styles.liveStatusCard}>
      <View style={styles.liveStatusRow}>
        <View style={styles.liveStatusIcon}>
          <Ionicons name="checkmark" size={18} color={theme.colors.text.inverse} />
        </View>
        <View style={styles.liveStatusCopy}>
          <Text variant="bodyBold">Checket ind</Text>
          <Text variant="small" color="secondary">
            {participantCountCopy}
          </Text>
        </View>
        <Button
          title={changingParticipation ? 'Tjekker ud…' : 'Check ud'}
          variant="ghost"
          size="sm"
          onPress={() => void handleCheckOut()}
          disabled={changingParticipation}
        />
      </View>

      {matchdayState.stadiumLiveOpen ? (
        <>
          <View style={styles.liveControls}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Tillad stadionreaktioner"
              accessibilityState={{
                checked: preferences?.reactionsEnabled ?? false,
                disabled: reactionControlDisabled,
              }}
              disabled={reactionControlDisabled}
              onPress={handleToggleReactions}
              style={({ pressed }) => [
                styles.liveControl,
                pressed ? styles.liveControlPressed : null,
                reactionControlDisabled ? styles.liveControlDisabled : null,
              ]}
            >
              <Ionicons name="happy-outline" size={19} color={theme.colors.primary} />
              <View style={styles.liveControlCopy}>
                <Text variant="small" style={styles.liveControlLabel}>
                  Reaktioner
                </Text>
                <Text
                  variant="small"
                  color={preferences?.reactionsEnabled ? 'success' : 'secondary'}
                  numberOfLines={1}
                >
                  {!preferencesReady
                    ? 'Henter…'
                    : savingPreferences
                      ? 'Gemmer…'
                      : preferences.reactionsEnabled
                        ? 'Til'
                        : 'Fra'}
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rediger afsnit eller tribune"
              accessibilityState={{ disabled: !preferencesReady || savingPreferences }}
              disabled={!preferencesReady || savingPreferences}
              onPress={handleOpenSectionEditor}
              style={({ pressed }) => [
                styles.liveControl,
                pressed ? styles.liveControlPressed : null,
                !preferencesReady || savingPreferences ? styles.liveControlDisabled : null,
              ]}
            >
              <Ionicons name="location-outline" size={19} color={theme.colors.primary} />
              <View style={styles.liveControlCopy}>
                <Text variant="small" style={styles.liveControlLabel}>
                  Tribune
                </Text>
                <Text variant="small" color="secondary" numberOfLines={1}>
                  {!preferencesReady ? 'Henter…' : preferences.sectionLabel || 'Tilføj'}
                </Text>
              </View>
            </Pressable>
          </View>

          {sectionEditorVisible ? (
            <View style={styles.sectionField}>
              <Text variant="small" color="secondary">
                Afsnit eller tribune (valgfrit)
              </Text>
              <TextInput
                autoFocus
                accessibilityLabel="Afsnit eller tribune"
                value={sectionDraft}
                editable={!savingPreferences}
                onChangeText={(value) => setSectionDraft(value.slice(0, 30))}
                onEndEditing={handleSectionEditingEnd}
                maxLength={30}
                returnKeyType="done"
                placeholder="Fx A-tribunen"
                placeholderTextColor={theme.colors.text.muted}
                style={styles.sectionInput}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );

  const ListHeader = (
    <View style={styles.listHeader}>
      {matchdayState.isCheckedIn ? renderCheckedInStatus() : null}
      {!matchdayState.stadiumLiveOpen ? (
        <Card style={styles.stateCard}>
          <Ionicons name="time-outline" size={32} color={theme.colors.primary} />
          <Text variant="h3" style={styles.centerText}>
            Stadion Live er lukket
          </Text>
          <Text color="secondary" style={styles.centerText}>
            Stadion Live åbner seks timer før kickoff og lukker seks timer efter.
          </Text>
        </Card>
      ) : !matchdayState.isCheckedIn ? (
        <Card style={styles.stateCard}>
          <Ionicons name="location-outline" size={32} color={theme.colors.primary} />
          <Text variant="h3" style={styles.centerText}>
            Check ind på stadion
          </Text>
          <Text color="secondary" style={styles.centerText}>
            Check ind på stadion for at se og interagere med andre fans.
          </Text>
          <Button
            title={changingParticipation ? 'Tjekker ind…' : 'Check ind på stadion'}
            onPress={() => void handleCheckIn()}
            disabled={changingParticipation || matchdayState.loading}
            fullWidth
          />
        </Card>
      ) : null}
      {matchdayState.isCheckedIn && receivedReactions.length > 0 ? (
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
                <Text
                  variant="small"
                  color="success"
                  numberOfLines={2}
                  style={styles.reciprocalText}
                >
                  ↔ I har reageret på hinanden
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
      {matchdayState.isCheckedIn &&
      matchdayState.stadiumLiveOpen &&
      participants.length === 0 &&
      !loading &&
      !error ? (
        <Card style={styles.stateCard}>
          <Ionicons name="people-outline" size={32} color={theme.colors.primary} />
          <Text variant="h3">Du er den første her</Text>
          <Text color="secondary" style={styles.centerText}>
            Andre fans dukker op her, når de checker ind.
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
            {matchdayState.participantCount}{' '}
            {matchdayState.participantCount === 1 ? 'fan er her' : 'fans er her'}
          </Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(participant) => participant.userId}
        contentContainerStyle={[styles.content, { paddingBottom: listBottomPadding }]}
        scrollIndicatorInsets={{ bottom: tabBarHeight }}
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
            sentReactionType={
              sentReaction?.userId === item.userId ? sentReaction.reactionType : null
            }
            cooldownSeconds={getRemainingCooldownSeconds(
              cooldownByUserId[item.userId] ?? null,
              cooldownNowMs,
            )}
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
    content: {
      paddingTop: theme.layout.listGap,
      paddingHorizontal: theme.layout.screenPadding,
    },
    listHeader: { gap: theme.layout.listGap, marginBottom: theme.layout.listGap },
    liveStatusCard: { gap: theme.layout.listGap },
    liveStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    liveStatusIcon: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.state.success,
    },
    liveStatusCopy: { flex: 1, minWidth: 0, gap: theme.spacing[1] / 2 },
    liveControls: {
      flexDirection: 'row',
      gap: theme.spacing[2],
    },
    liveControl: {
      flex: 1,
      minWidth: 0,
      minHeight: theme.spacing[12],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.surface,
    },
    liveControlCopy: { flex: 1, minWidth: 0 },
    liveControlLabel: { fontWeight: '700' },
    liveControlPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
    liveControlDisabled: { opacity: 0.48 },
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
    reciprocalText: { flexShrink: 1, textAlign: 'right' },
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
