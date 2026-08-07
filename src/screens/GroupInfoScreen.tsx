import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { DirectMessageReportModal } from '../components/messages/DirectMessageReportModal';
import { GroupAvatar } from '../components/messages/GroupAvatar';
import { GroupMemberRow } from '../components/messages/GroupMemberRow';
import { MessageScreenHeader } from '../components/messages/MessageScreenHeader';
import { Button, Text } from '../components/ui';
import { supabase } from '../lib/supabase';
import {
  addGroupMembers,
  getConversationDetails,
  getGroupMembers,
  leaveGroup,
  removeGroupMember,
  reportConversation,
  searchDirectMessageUsers,
  updateGroupMemberRole,
  updateGroupMetadata,
} from '../services/messagesApi';
import { useTheme, type Theme } from '../theme';
import type {
  ConversationDetails,
  DirectMessageReportReason,
  GroupMember,
  MessageUserSearchResult,
} from '../types/messages';
import { getConversationTitle } from '../utils/directMessages';

type GroupInfoRoute = { params?: { conversationId?: string } };

export default function GroupInfoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute() as GroupInfoRoute;
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const conversationId = route.params?.conversationId?.trim() ?? '';
  const [details, setDetails] = useState<ConversationDetails | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MessageUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const searchRequestRef = useRef(0);

  const load = useCallback(async () => {
    if (!conversationId) return navigation.replace('MessagesList');
    try {
      const [nextDetails, nextMembers] = await Promise.all([
        getConversationDetails(conversationId),
        getGroupMembers(conversationId),
      ]);
      if (!nextDetails || nextDetails.type !== 'group') {
        navigation.replace('MessagesList');
        return;
      }
      setDetails(nextDetails);
      setName(nextDetails.name ?? '');
      setMembers(nextMembers);
    } catch (error) {
      Alert.alert(
        'Gruppen er ikke tilgængelig',
        error instanceof Error ? error.message : 'Prøv igen.',
      );
      navigation.replace('MessagesList');
    } finally {
      setLoading(false);
    }
  }, [conversationId, navigation]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    const channel = supabase
      .channel(`group-info-${conversationId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void load(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [conversationId, load, user?.id]);

  useEffect(() => {
    const normalized = query.trim();
    if (!showAdd || normalized.length < 2) {
      searchRequestRef.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    const requestId = ++searchRequestRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchDirectMessageUsers(normalized)
        .then((rows) => {
          if (searchRequestRef.current === requestId) {
            setResults(rows.filter((row) => !members.some((member) => member.id === row.id)));
          }
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [members, query, showAdd]);

  const canManage = details?.currentUserRole === 'owner' || details?.currentUserRole === 'admin';

  const saveName = async () => {
    if (!details || !canManage || saving || name.trim() === details.name) return;
    setSaving(true);
    try {
      await updateGroupMetadata(details.id, name);
      await load();
    } catch (error) {
      Alert.alert(
        'Navnet kunne ikke gemmes',
        error instanceof Error ? error.message : 'Prøv igen.',
      );
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (peer: MessageUserSearchResult) => {
    if (!details || members.length >= 10) return;
    setSaving(true);
    try {
      await addGroupMembers(details.id, [peer.id]);
      setQuery('');
      setShowAdd(false);
      await load();
    } catch (error) {
      Alert.alert(
        'Medlemmet kunne ikke tilføjes',
        error instanceof Error ? error.message : 'Prøv igen.',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = (member: GroupMember) => {
    if (!details) return;
    Alert.alert('Fjern medlem', `Vil du fjerne ${member.displayName} fra gruppen?`, [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Fjern',
        style: 'destructive',
        onPress: () =>
          void removeGroupMember(details.id, member.id)
            .then(load)
            .catch((error) =>
              Alert.alert(
                'Medlemmet kunne ikke fjernes',
                error instanceof Error ? error.message : 'Prøv igen.',
              ),
            ),
      },
    ]);
  };

  const changeRole = (member: GroupMember) => {
    if (!details || details.currentUserRole !== 'owner') return;
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    Alert.alert(
      nextRole === 'admin' ? 'Gør til admin' : 'Fjern adminrolle',
      `${member.displayName} bliver ${nextRole === 'admin' ? 'admin' : 'medlem'}.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Bekræft',
          onPress: () =>
            void updateGroupMemberRole(details.id, member.id, nextRole)
              .then(load)
              .catch((error) =>
                Alert.alert(
                  'Rollen kunne ikke opdateres',
                  error instanceof Error ? error.message : 'Prøv igen.',
                ),
              ),
        },
      ],
    );
  };

  const confirmLeave = () => {
    if (!details || details.currentUserRole === 'owner') return;
    Alert.alert('Forlad gruppe', 'Du mister straks adgang til gruppen og dens historik.', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Forlad',
        style: 'destructive',
        onPress: () =>
          void leaveGroup(details.id)
            .then(() => navigation.replace('MessagesList'))
            .catch((error) =>
              Alert.alert(
                'Gruppen kunne ikke forlades',
                error instanceof Error ? error.message : 'Prøv igen.',
              ),
            ),
      },
    ]);
  };

  const submitReport = async (reason: DirectMessageReportReason, note: string) => {
    if (!details || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await reportConversation({
        conversationId: details.id,
        targetType: 'conversation',
        reason,
        note,
      });
      setReportVisible(false);
      Alert.alert('Tak', 'Din rapport er sendt.');
    } catch (error) {
      Alert.alert(
        'Rapporten kunne ikke sendes',
        error instanceof Error ? error.message : 'Prøv igen.',
      );
    } finally {
      setReportSubmitting(false);
    }
  };

  const title = details ? getConversationTitle(details) : 'Gruppeinfo';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MessageScreenHeader title="Gruppeinfo" onBack={() => navigation.goBack()} />
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.identity}>
              <GroupAvatar name={title} avatarUrl={details?.avatarUrl} size={theme.spacing[16]} />
              <Text variant="h2" numberOfLines={2} style={styles.groupTitle}>
                {title}
              </Text>
              <Text variant="body" color="secondary">
                {members.length} medlemmer
              </Text>
            </View>
            {canManage ? (
              <View style={styles.editBand}>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  maxLength={80}
                  accessibilityLabel="Gruppenavn"
                />
                <Button
                  title={saving ? 'Gemmer...' : 'Gem navn'}
                  onPress={() => void saveName()}
                  disabled={saving || !name.trim() || name.trim() === details?.name}
                />
              </View>
            ) : null}
            <View style={styles.sectionHeader}>
              <Text variant="h3">Medlemmer</Text>
              {canManage && members.length < 10 ? (
                <Pressable
                  style={styles.iconAction}
                  onPress={() => setShowAdd((value) => !value)}
                  accessibilityRole="button"
                  accessibilityLabel="Tilføj medlem"
                >
                  <Ionicons name="person-add-outline" size={22} color={theme.colors.primary} />
                </Pressable>
              ) : null}
            </View>
            {showAdd ? (
              <View style={styles.addPanel}>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={20} color={theme.colors.text.muted} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Søg efter fan"
                    placeholderTextColor={theme.colors.text.muted}
                    autoCapitalize="none"
                  />
                  {searching ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : null}
                </View>
                {results.map((peer) => (
                  <Pressable
                    key={peer.id}
                    style={styles.addResult}
                    onPress={() => void addMember(peer)}
                    disabled={saving}
                  >
                    <Text variant="body" style={styles.addResultName}>
                      {peer.displayName}
                    </Text>
                    <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const canRemove = Boolean(
            item.id !== user?.id &&
            item.role !== 'owner' &&
            (details?.currentUserRole === 'owner' ||
              (details?.currentUserRole === 'admin' && item.role === 'member')),
          );
          return (
            <GroupMemberRow
              member={item}
              canRemove={canRemove}
              onOpen={() => {
                if (
                  details?.currentUserRole === 'owner' &&
                  item.id !== user?.id &&
                  item.role !== 'owner'
                ) {
                  Alert.alert(item.displayName, undefined, [
                    {
                      text: item.role === 'admin' ? 'Fjern adminrolle' : 'Gør til admin',
                      onPress: () => changeRole(item),
                    },
                    {
                      text: 'Se profil',
                      onPress: () => navigation.navigate('PublicProfile', { userId: item.id }),
                    },
                    { text: 'Annuller', style: 'cancel' },
                  ]);
                } else {
                  navigation.navigate('PublicProfile', { userId: item.id });
                }
              }}
              onRemove={() => confirmRemove(item)}
            />
          );
        }}
        ListFooterComponent={
          <View style={styles.footerActions}>
            {details?.currentUserRole === 'owner' ? (
              <Text variant="small" color="secondary" style={styles.ownerNote}>
                Ejeren kan ikke forlade gruppen. En ny ejer vælges kun ved kontosletning.
              </Text>
            ) : (
              <Button title="Forlad gruppe" variant="outline" onPress={confirmLeave} fullWidth />
            )}
            <Button
              title="Rapportér gruppe"
              variant="ghost"
              onPress={() => setReportVisible(true)}
              fullWidth
            />
          </View>
        }
      />
      <DirectMessageReportModal
        visible={reportVisible}
        submitting={reportSubmitting}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason, note) => void submitReport(reason, note)}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg.default },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.default,
    },
    identity: { alignItems: 'center', padding: theme.layout.screenPadding, gap: theme.spacing[2] },
    groupTitle: { textAlign: 'center' },
    editBand: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingBottom: theme.spacing[4],
      gap: theme.spacing[2],
    },
    nameInput: {
      minHeight: theme.spacing[11],
      paddingHorizontal: theme.spacing[3],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.bg.card,
      fontSize: theme.typography.body.fontSize,
    },
    sectionHeader: {
      minHeight: theme.spacing[12],
      paddingHorizontal: theme.layout.screenPadding,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconAction: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPanel: { paddingHorizontal: theme.layout.screenPadding, paddingBottom: theme.spacing[3] },
    searchRow: {
      minHeight: theme.spacing[11],
      paddingHorizontal: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
    },
    searchInput: { flex: 1, color: theme.colors.text.primary },
    addResult: {
      minHeight: theme.spacing[11],
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.subtle,
    },
    addResultName: { flex: 1 },
    footerActions: { padding: theme.layout.screenPadding, gap: theme.spacing[3] },
    ownerNote: { textAlign: 'center' },
  });
}
