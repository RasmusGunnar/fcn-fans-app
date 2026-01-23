import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeed } from '../state/FeedContext';
import { NewsComposer } from '../components/NewsComposer';
import { PostComposer } from '../components/PostComposer';
import { ActorSelector } from '../components/ActorSelector';
import { colors, spacing, radius } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { Actor } from '../types/news';

interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
}

type ContentType = null | 'post' | 'news';

export default function CreateSheet({ visible, onClose }: CreateSheetProps) {
  console.log('[CreateSheet] Component rendered', { visible });
  const insets = useSafeAreaInsets();
  const { fetchPosts } = useFeed();
  const { user } = useAuth();

  const [contentType, setContentType] = useState<ContentType>(null);
  const [actor, setActor] = useState<Actor>({
    type: 'user',
    id: user?.id || '',
    name: user?.email || 'Dig',
  });

  // Reset actor when user changes
  useEffect(() => {
    if (user) {
      setActor({
        type: 'user',
        id: user.id,
        name: user.email || 'Dig',
      });
    }
  }, [user]);

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
            <Ionicons name="close" size={28} color={colors.text} />
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
                  <Ionicons name="create" size={40} color={colors.fcnRed} />
                </View>
                <Text style={styles.choiceTitle}>Opret opslag</Text>
                <Text style={styles.choiceDescription}>
                  Del dine tanker med fællesskabet. Tilføj billede hvis du vil.
                </Text>
              </Pressable>

              <Pressable style={styles.choiceCard} onPress={() => setContentType('news')}>
                <View style={styles.choiceIcon}>
                  <Ionicons name="link" size={40} color={colors.fcnRed} />
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
              <View style={{ padding: spacing.md }}>
                <Text style={styles.infoText}>
                  💡 Community-posting for opslag kommer snart. Lige nu oprettes opslag som dig selv.
                </Text>
              </View>
              <PostComposer onSuccess={handlePostSuccess} />
            </>
          ) : (
            // Step 2: News composer with actor selector
            <>
              <View style={{ padding: spacing.md }}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    flex: 1,
  },
  choiceContainer: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  choiceCard: {
    backgroundColor: colors.card,
    padding: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  choiceTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  choiceDescription: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoText: {
    fontSize: 14,
    color: colors.subtext,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
});
