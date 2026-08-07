import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { MessageScreenHeader } from '../components/messages/MessageScreenHeader';
import { Text } from '../components/ui';
import { createOrGetDirectConversation, searchDirectMessageUsers } from '../services/messagesApi';
import { useTheme, type Theme } from '../theme';
import type { MessageUserSearchResult } from '../types/messages';

export default function NewMessageScreen() {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MessageUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
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
    if (openingUserId) return;
    setOpeningUserId(peer.id);
    setError(null);
    try {
      const conversationId = await createOrGetDirectConversation(peer.id);
      navigation.replace('Conversation', { conversationId, peer });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Samtalen kunne ikke startes.');
    } finally {
      setOpeningUserId(null);
    }
  };

  return (
    <View style={styles.container}>
      <MessageScreenHeader title="Ny besked" onBack={() => navigation.goBack()} />
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
          autoFocus
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
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.resultRow, pressed && styles.resultPressed]}
            onPress={() => void openConversation(item)}
            disabled={Boolean(openingUserId)}
            accessibilityRole="button"
            accessibilityLabel={`Start samtale med ${item.displayName}`}
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
              {item.mutualCommunityCount > 0 ? (
                <Text variant="small" color="muted">
                  {item.mutualCommunityCount} fælles fællesskab
                  {item.mutualCommunityCount === 1 ? '' : 'er'}
                </Text>
              ) : null}
            </View>
            {openingUserId === item.id ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.text.muted} />
            )}
          </Pressable>
        )}
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
    resultPressed: { backgroundColor: theme.colors.bg.subtle },
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
