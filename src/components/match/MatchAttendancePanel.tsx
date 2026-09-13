import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
import { useTheme } from '../../theme';
import { fetchMatchAttendeePage, type AttendeeProfile } from '../../services/attendance';
import type { SharedMatchdayState } from '../../state/matchdayStateCore';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { createOrGetDirectConversation } from '../../services/messagesApi';
import { navigateToDirectMessageConversation } from '../../navigation/navigationRef';
import { matchRsvp } from '../../utils/fanExperience';

export function MatchAttendancePanel({
  state,
  planningAllowed,
  setRsvp,
  checkIn,
  checkOut,
  embedded = false,
  socialOnly = false,
}: {
  state: SharedMatchdayState;
  planningAllowed: boolean;
  setRsvp: (status: 'going' | 'not_going') => Promise<void>;
  checkIn: () => Promise<void>;
  checkOut: () => Promise<void>;
  embedded?: boolean;
  socialOnly?: boolean;
}) {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const rsvp = matchRsvp(state.rsvpStatus);
  const [openingUser, setOpeningUser] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<AttendeeProfile[]>([]);
  const [next, setNext] = useState<number | null>(0);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [listError, setListError] = useState('');
  const color = theme.colors.text.primary;
  const primary = theme.colors.primaryDark;
  const available = state.loaded && !state.error;
  const checkinRelevant = planningAllowed && state.stadiumLiveOpen;
  async function load(offset: number) {
    if (pending) return;
    setPending(true);
    setListError('');
    try {
      const result = await fetchMatchAttendeePage(state.matchId, offset);
      setPeople((previous) => [
        ...new Map(
          [...(offset ? previous : []), ...result.profiles].map((person) => [
            person.user_id,
            person,
          ]),
        ).values(),
      ]);
      setNext(result.nextOffset);
    } catch {
      setListError('Deltagerne kunne ikke hentes. Prøv igen.');
    } finally {
      setPending(false);
    }
  }
  async function action(run: () => Promise<void>) {
    setFeedback('');
    try {
      await run();
    } catch {
      setFeedback('Kunne ikke gemme. Prøv igen.');
    }
  }
  return (
    <View
      testID="match-attendance"
      style={[
        styles.panel,
        {
          backgroundColor: theme.colors.bg.card,
          borderRadius: embedded ? 0 : 18,
          borderTopWidth: embedded ? StyleSheet.hairlineWidth : 0,
          borderTopColor: theme.colors.border.subtle,
        },
      ]}
    >
      <View style={styles.socialHeading}>
        <Text accessibilityRole="header" style={[styles.heading, { color }]}>
          {available ? (
            <>
              <Text style={styles.count}>{state.attendanceCount}</Text> fans kommer
            </>
          ) : (
            'Deltagerantal ikke tilgængeligt'
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Se alle deltagere"
          accessibilityHint="Åbner listen over fans, der kommer på stadion."
          onPress={() => {
            setOpen(true);
            void load(0);
          }}
          style={({ pressed }) => [styles.seeAll, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.linkLabel, { color: primary }]}>Se alle</Text>
          <Ionicons name="chevron-forward" size={14} color={primary} />
        </Pressable>
      </View>
      <View style={styles.socialPreview}>
        <View style={styles.avatarStack}>
          {state.attendanceProfiles.slice(0, 5).map((person, index) => (
            <View
              key={person.user_id}
              accessible
              accessibilityLabel={person.display_name || 'FCN fan'}
              style={{
                marginLeft: index ? -7 : 0,
                borderWidth: 2,
                borderColor: theme.colors.bg.card,
                borderRadius: 20,
              }}
            >
              <Avatar
                avatarUrl={person.avatar_url}
                label={person.display_name || 'FCN fan'}
                size={30}
              />
            </View>
          ))}
        </View>
        <Text style={[styles.note, { color: theme.colors.text.secondary, flex: 1 }]}>
          {available ? rsvp.title : 'Din tilmelding kunne ikke hentes'}
        </Text>
      </View>
      {planningAllowed && !socialOnly ? (
        <View style={styles.actions}>
          <AttendanceAction
            label="Jeg kommer"
            primary
            stretch
            selected={rsvp.attending}
            disabled={state.loading}
            onPress={() => void action(() => setRsvp('going'))}
          />
          <AttendanceAction
            label="Kan ikke komme"
            stretch
            selected={rsvp.notAttending}
            disabled={state.loading}
            onPress={() => void action(() => setRsvp('not_going'))}
          />
        </View>
      ) : null}
      {!socialOnly ? (
        <View
          testID="match-checkin"
          style={[styles.checkin, { borderTopColor: theme.colors.border.subtle }]}
        >
          <Ionicons
            name={checkinRelevant ? 'location-outline' : 'lock-closed-outline'}
            size={16}
            color={theme.colors.text.secondary}
          />
          <View style={styles.checkinCopy}>
            <Text style={[styles.note, { color: theme.colors.text.secondary }]}>
              {!available
                ? 'Check-in-status ikke tilgængelig'
                : !checkinRelevant
                  ? planningAllowed
                    ? 'Check-in åbner i kampvinduet'
                    : 'Check-in er lukket'
                  : state.isCheckedIn
                    ? '✓ Du er tjekket ind'
                    : state.canCheckIn
                      ? 'Er du på stadion?'
                      : 'Check-in er ikke tilgængeligt lige nu'}
            </Text>
            {checkinRelevant && available ? (
              <Text style={[styles.caption, { color: theme.colors.text.secondary }]}>
                {state.isCheckedIn
                  ? `${state.participantCount} på stadion · separat fra tilmelding`
                  : 'På stadion · separat fra tilmelding'}
              </Text>
            ) : null}
          </View>
          {checkinRelevant ? (
            <AttendanceAction
              compact
              label={state.isCheckedIn ? 'Tjek ud' : 'Tjek ind'}
              selected={state.isCheckedIn}
              disabled={!available || state.loading || (!state.isCheckedIn && !state.canCheckIn)}
              onPress={() => void action(state.isCheckedIn ? checkOut : checkIn)}
            />
          ) : null}
        </View>
      ) : null}
      {feedback || state.error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.colors.error }]}>
          {feedback || state.error}
        </Text>
      ) : null}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: theme.colors.bg.card }}
          accessibilityViewIsModal
        >
          <View style={styles.listHeader}>
            <View style={styles.socialHeading}>
              <Text accessibilityRole="header" style={[styles.heading, { color }]}>
                Fans, der kommer
              </Text>
              <AttendanceAction compact label="Luk" onPress={() => setOpen(false)} />
            </View>
            <Text style={[styles.note, { color: theme.colors.text.secondary }]}>
              Vi mødes på stadion · tilmeldinger, ikke check-ins
            </Text>
          </View>
          <FlatList
            data={people}
            keyExtractor={(person) => person.user_id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.person}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Åbn profil for ${item.display_name || 'FCN fan'}`}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: 'center',
                    minHeight: 44,
                  }}
                  onPress={() => {
                    setOpen(false);
                    navigation.navigate('PublicProfile', { userId: item.user_id });
                  }}
                >
                  <Avatar
                    avatarUrl={item.avatar_url}
                    label={item.display_name || 'FCN fan'}
                    size={40}
                  />
                  <Text style={{ color, fontWeight: '600', flex: 1 }}>
                    {item.display_name || 'FCN fan'}
                  </Text>
                </Pressable>
                {item.canMessage ? (
                  <AttendanceAction
                    compact
                    label={openingUser === item.user_id ? 'Åbner…' : 'Send besked'}
                    disabled={openingUser !== null}
                    onPress={() => {
                      if (openingUser) return;
                      setOpeningUser(item.user_id);
                      setListError('');
                      void createOrGetDirectConversation(item.user_id)
                        .then((conversationId) => {
                          setOpen(false);
                          navigateToDirectMessageConversation(conversationId);
                        })
                        .catch((error: unknown) => {
                          setListError(
                            error instanceof Error ? error.message : 'Samtalen kunne ikke åbnes.',
                          );
                        })
                        .finally(() => setOpeningUser(null));
                    }}
                  />
                ) : null}
              </View>
            )}
            ListEmptyComponent={
              !pending ? (
                <Text style={{ color }}>Ingen tilgængelige deltagerprofiler endnu.</Text>
              ) : null
            }
            ListFooterComponent={
              <View style={{ gap: 12 }}>
                {pending ? (
                  <ActivityIndicator color={primary} accessibilityLabel="Henter deltagere" />
                ) : null}
                {listError ? (
                  <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.error }}>
                    {listError}
                  </Text>
                ) : null}
                {next !== null || listError ? (
                  <AttendanceAction
                    label={listError ? 'Prøv igen' : 'Vis flere'}
                    disabled={pending}
                    onPress={() => void load(next ?? 0)}
                  />
                ) : null}
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function AttendanceAction({
  label,
  onPress,
  selected = false,
  disabled = false,
  primary = false,
  compact = false,
  stretch = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  primary?: boolean;
  compact?: boolean;
  stretch?: boolean;
}) {
  const theme = useTheme();
  const foreground = primary
    ? '#fff'
    : selected
      ? theme.colors.text.primary
      : theme.colors.text.secondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        stretch && styles.stretchAction,
        {
          paddingHorizontal: compact ? 10 : 14,
          backgroundColor: primary
            ? selected
              ? theme.colors.primaryDark
              : theme.colors.primary
            : selected
              ? theme.colors.bg.subtle
              : compact
                ? 'transparent'
                : theme.colors.bg.default,
          borderColor: selected && !primary ? theme.colors.text.secondary : 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {selected && primary && !compact ? (
        <Ionicons name="checkmark" size={15} color={foreground} />
      ) : null}
      <Text
        style={[
          styles.actionLabel,
          { color: foreground, fontWeight: selected || primary ? '700' : '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 10 },
  socialHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heading: { fontSize: 15, lineHeight: 23, fontWeight: '600', flex: 1 },
  count: { fontSize: 23, fontWeight: '800' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44, paddingLeft: 8 },
  linkLabel: { fontWeight: '600', fontSize: 12 },
  socialPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -4,
    marginBottom: 2,
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    minHeight: 44,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stretchAction: { flexGrow: 1, flexBasis: 130 },
  actionLabel: { fontSize: 13, lineHeight: 18, textAlign: 'center', flexShrink: 1 },
  note: { fontSize: 12, lineHeight: 17 },
  caption: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  checkin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  checkinCopy: { flex: 1 },
  listHeader: { padding: 20, paddingBottom: 8, gap: 4 },
  listContent: { padding: 20, gap: 18 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
