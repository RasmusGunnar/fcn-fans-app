import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeed } from '../state/FeedContext';
import { NewsComposer } from '../components/NewsComposer';
import { PostComposer } from '../components/PostComposer';
import { ActorSelector } from '../components/ActorSelector';
import { useTheme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { Actor } from '../types/news';
import { resolveProfileDisplayName } from '../utils/actor';

interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
}

type ContentType = null | 'post' | 'news';

export default function CreateSheet({ visible, onClose }: CreateSheetProps) {
  console.log('[CreateSheet] Component rendered', { visible });
  const insets = useSafeAreaInsets();
  const { fetchPosts, profileMap } = useFeed();
  const { user } = useAuth();
  const theme = useTheme();

  const [contentType, setContentType] = useState<ContentType>(null);
  const [actor, setActor] = useState<Actor>({
    type: 'user',
    id: user?.id || '',
    name: resolveProfileDisplayName(profileMap, user?.id, user?.email || undefined),
  });

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

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      console.log('[CreateSheet] Modal closed - resetting state');
      setContentType(null);
    } else {
      console.log('[CreateSheet] Modal opened - showing Step 1 (choose type)');
    }
  }, [visible]);

  // Log when visibility changes
  useEffect(() => {
    console.log('[CreateSheet] Visibility changed:', visible);
  }, [visible]);

  const handleNewsSuccess = () => {
    console.log('[CreateSheet] News success - closing modal');
    fetchPosts();
    onClose();
  };

  const handlePostSuccess = () => {
    console.log('[CreateSheet] Post success - closing modal');
    onClose();
  };

  const handleClose = () => {
    console.log('[CreateSheet] Close button pressed - closing modal');
    onClose();
  };

  const styles = makeStyles(theme);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
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
              <View style={{ padding: theme.spacing[4] }}>
                <ActorSelector selectedActor={actor} onSelectActor={setActor} />
              </View>
              <PostComposer actor={actor} onSuccess={handlePostSuccess} />
            </>
          ) : (
            // Step 2: News composer with actor selector
            <>
              <View style={{ padding: theme.spacing[4] }}>
                <ActorSelector selectedActor={actor} onSelectActor={setActor} />
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
      paddingVertical: theme.spacing[4],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.default,
    },
    closeButton: {
      padding: theme.spacing[1],
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    content: {
      flex: 1,
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
