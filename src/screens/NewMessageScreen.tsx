import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { MessageScreenHeader } from '../components/messages/MessageScreenHeader';
import { Button, SegmentedControl, Text } from '../components/ui';
import {
  createGroupConversation,
  createOrGetDirectConversation,
  searchDirectMessageUsers,
} from '../services/messagesApi';
import { useTheme, type Theme } from '../theme';
import type { MessageUserSearchResult } from '../types/messages';
import type { SharedLinkAttachment } from '../types/externalShare';
import { validateGroupCreation } from '../utils/directMessages';

type ComposeMode = 'direct' | 'group';

export default function NewMessageScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute() as { params?: { externalShare?: SharedLinkAttachment } };
  const externalShare = route.params?.externalShare;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<ComposeMode>('direct');
  const [query, setQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [results, setResults] = useState<MessageUserSearchResult[]>([]);
  const [selected, setSelected] = useState<MessageUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      requestIdRef.current += 1;
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setSearching(true);
    setError(null);
    const timer = setTimeout(() => {
      void searchDirectMessageUsers(normalized)
        .then((nextResults) => {
          if (requestIdRef.current === requestId) setResults(nextResults);
        })
        .catch((searchError) => {
          if (requestIdRef.current === requestId) {
            setError(searchError instanceof Error ? searchError.message : 'Søgningen fejlede.');
          }
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const openConversation = async (peer: MessageUserSearchResult) => {
    if (openingUserId || creatingGroup) return;
    setOpeningUserId(peer.id);
    setError(null);
    try {
      const conversationId = await createOrGetDirectConversation(peer.id);
      navigation.replace('Conversation', { conversationId, peer, externalShare });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Samtalen kunne ikke startes.');
    } finally {
      setOpeningUserId(null);
    }
  };

  const toggleSelected = (peer: MessageUserSearchResult) => {
    setError(null);
    setSelected((current) => {
      if (current.some((item) => item.id === peer.id)) {
        return current.filter((item) => item.id !== peer.id);
      }
      if (current.length >= 9) {
        setError('Du kan vælge højst 9 andre fans.');
        return current;
      }
      return [...current, peer];
    });
  };

  const submitGroup = async () => {
    const validationError = validateGroupCreation(
      groupName,
      selected.map((item) => item.id),
    );
    if (validationError || creatingGroup) {
      setError(validationError);
      return;
    }
    setCreatingGroup(true);
    setError(null);
    try {
      const conversationId = await createGroupConversation(
        groupName,
        selected.map((item) => item.id),
      );
      navigation.replace('Conversation', { conversationId, externalShare });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Gruppen kunne ikke oprettes.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const groupValidation = validateGroupCreation(
    groupName,
    selected.map((item) => item.id),
  );

  return (
    <View style={styles.container}>
      <MessageScreenHeader title="Ny samtale" onBack={() => navigation.goBack()} />
      <SegmentedControl
        items={[
          { key: 'direct', label: 'Ny besked' },
          { key: 'group', label: 'Ny gruppe' },
        ]}
        activeKey={mode}
        onChange={(nextMode) => {
          setMode(nextMode);
          setError(null);
        }}
        style={styles.segmented}
      />

      {mode === 'group' ? (
        <View style={styles.groupSetup}>
          <TextInput
            style={styles.groupNameInput}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Gruppenavn"
            placeholderTextColor={theme.colors.text.muted}
            maxLength={80}
            accessibilityLabel="Gruppenavn"
          />
          {selected.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedList}
            >
              {selected.map((peer) => (
                <Pressable
                  key={peer.id}
                  style={styles.selectedChip}
                  onPress={() => toggleSelected(peer)}
                  accessibilityRole="button"
                  accessibilityLabel={`Fjern ${peer.displayName}`}
                >
                  <Avatar
                    userId={peer.id}
                    avatarUrl={peer.avatarUrl}
                    label={peer.displayName}
                    size={theme.spacing[7]}
                  />
                  <Text variant="small" numberOfLines={1} style={styles.selectedName}>
                    {peer.displayName}
                  </Text>
                  <Ionicons name="close" size={16} color={theme.colors.text.secondary} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Button
            title={creatingGroup ? 'Opretter...' : `Opret gruppe (${selected.length + 1}/10)`}
            onPress={() => void submitGroup()}
            disabled={Boolean(groupValidation) || creatingGroup}
            fullWidth
          />
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={theme.colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Søg efter navn eller brugernavn"
          placeholderTextColor={theme.colors.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Søg efter bruger"
        />
        {searching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>
      {error ? (
        <View style={styles.errorBand}>
          <Text variant="body" color="error">
            {error}
          </Text>
        </View>
      ) : null}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSelected = selected.some((peer) => peer.id === item.id);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.resultRow,
                isSelected && styles.resultSelected,
                pressed && styles.resultPressed,
              ]}
              onPress={() =>
                mode === 'group' ? toggleSelected(item) : void openConversation(item)
              }
              disabled={Boolean(openingUserId) || creatingGroup}
              accessibilityRole="button"
              accessibilityLabel={
                mode === 'group'
                  ? `${isSelected ? 'Fjern' : 'Vælg'} ${item.displayName}`
                  : `Start samtale med ${item.displayName}`
              }
            >
              <Avatar
                userId={item.id}
                avatarUrl={item.avatarUrl}
                label={item.displayName}
                size={theme.spacing[12]}
              />
              <View style={styles.resultCopy}>
                <Text variant="bodyBold" numberOfLines={1}>
                  {item.displayName}
                </Text>
                {item.username ? (
                  <Text variant="small" color="secondary">
                    @{item.username}
                  </Text>
                ) : null}
              </View>
              {openingUserId === item.id ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <Ionicons
                  name={
                    mode === 'group'
                      ? isSelected
                        ? 'checkmark-circle'
                        : 'add-circle-outline'
                      : 'chevron-forward'
                  }
                  size={22}
                  color={isSelected ? theme.colors.primary : theme.colors.text.muted}
                />
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          query.trim().length < 2 ? (
            <View style={styles.emptyState}>
              <Text variant="body" color="secondary" style={styles.emptyText}>
                Skriv mindst to tegn for at finde en fan.
              </Text>
            </View>
          ) : !searching ? (
            <View style={styles.emptyState}>
              <Text variant="body" color="secondary">
                Ingen brugere fundet.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={results.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg.default },
    segmented: { marginHorizontal: theme.layout.screenPadding },
    groupSetup: { paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing[2] },
    groupNameInput: {
      minHeight: theme.spacing[11],
      paddingHorizontal: theme.spacing[3],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.bg.card,
      fontSize: theme.typography.body.fontSize,
    },
    selectedList: { gap: theme.spacing[2] },
    selectedChip: {
      maxWidth: 170,
      minHeight: theme.spacing[9],
      paddingHorizontal: theme.spacing[2],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
    },
    selectedName: { flexShrink: 1 },
    searchWrap: {
      margin: theme.layout.screenPadding,
      minHeight: theme.spacing[12],
      paddingHorizontal: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.text.primary,
      fontSize: theme.typography.body.fontSize,
    },
    resultRow: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.card,
    },
    resultSelected: { backgroundColor: theme.colors.bg.subtle },
    resultPressed: { opacity: 0.8 },
    resultCopy: { flex: 1, minWidth: 0, gap: theme.spacing[0] },
    errorBand: { paddingHorizontal: theme.layout.screenPadding, paddingBottom: theme.spacing[3] },
    emptyList: { flexGrow: 1 },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.layout.screenPadding,
    },
    emptyText: { textAlign: 'center' },
  });
}
