import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { FanPostCard } from '../components/cards/FanPostCard';
import { Post } from '../types/post';
import { colors, spacing } from '../theme';

type CommunityDetailRouteProp = RouteProp<{ CommunityDetail: { id: string; title: string } }, 'CommunityDetail'>;

export default function CommunityDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<CommunityDetailRouteProp>();
  const { title } = route.params || { title: 'Farum Fans' };
  const tabBarHeight = useBottomTabBarHeight();

  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<Post[]>([
    {
      id: '1',
      authorName: 'Morten Hansen',
      communityName: 'Farum Fans',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      text: 'Hej alle! Jeg glæder mig til kampen i morgen. Kommer nogen med toget fra København?',
      likesCount: 12,
      commentsCount: 4,
      likedByMe: false,
    },
    {
      id: '2',
      authorName: 'Lars Jensen',
      communityName: 'Farum Fans',
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      text: 'Har nogen set den nye trøje? Ser rigtig godt ud!',
      likesCount: 8,
      commentsCount: 2,
      likedByMe: true,
    },
  ]);

  const [postLikes, setPostLikes] = useState<Record<string, boolean>>(
    posts.reduce((acc, post) => ({ ...acc, [post.id]: post.likedByMe }), {})
  );

  const toggleLike = (postId: string) => {
    setPostLikes((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const handleSharePost = () => {
    if (postText.trim()) {
      console.log('Share post:', postText);
      setPostText('');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>156 medlemmer</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
      >
        {/* Community Info Card */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={styles.avatar}>
              <Ionicons name="people-circle" size={60} color={colors.fcnRed} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>{title}</Text>
              <Text style={styles.infoDescription}>
                Velkommen til {title}! Vi er en lokal gruppe dedikerede FCN-fans fra Farum-området.
                Vi arrangerer fælles busture til kampe og sociale arrangementer.
              </Text>
              <View style={styles.metaRow}>
                <Ionicons name="location" size={14} color={colors.subtext} />
                <Text style={styles.metaText}>Farum</Text>
                <Text style={styles.metaSeparator}>•</Text>
                <Ionicons name="people" size={14} color={colors.subtext} />
                <Text style={styles.metaText}>156 medlemmer</Text>
              </View>
            </View>
          </View>
          <PrimaryButton title="Medlem af fællesskabet ✓" variant="blue" onPress={() => {}} />
        </Card>

        {/* Upcoming Events Card */}
        <Card style={styles.eventsCard}>
          <Text style={styles.sectionTitle}>KOMMENDE ARRANGEMENTER</Text>
          <View style={styles.eventRow}>
            <View style={styles.eventIcon}>
              <Ionicons name="bus" size={20} color={colors.fcnRed} />
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventTitle}>Bustur til Silkeborg</Text>
              <Text style={styles.eventMeta}>Lørdag 18. januar 2025, 14:00</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </View>
          <View style={styles.eventRow}>
            <View style={styles.eventIcon}>
              <Ionicons name="calendar" size={20} color={colors.fcnRed} />
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventTitle}>Sæsonkort møde</Text>
              <Text style={styles.eventMeta}>Tirsdag 21. januar 2025, 19:00</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </View>
        </Card>

        {/* Composer Card */}
        <Card style={styles.composerCard}>
          <Text style={styles.composerTitle}>Del noget med {title}…</Text>
          <TextInput
            style={styles.composerInput}
            placeholder="Skriv dit opslag..."
            value={postText}
            onChangeText={setPostText}
            multiline
            numberOfLines={3}
          />
          <View style={styles.composerActions}>
            <PrimaryButton
              title="Del"
              onPress={handleSharePost}
              disabled={!postText.trim()}
            />
          </View>
        </Card>

        {/* Latest Updates */}
        <View style={styles.updatesSection}>
          <Text style={styles.sectionTitle}>SENESTE OPDATERINGER</Text>
          {posts.map(post => (
            <FanPostCard
              key={post.id}
              post={post}
              liked={postLikes[post.id] || false}
              onToggleLike={() => toggleLike(post.id)}
              onPressComment={() => console.log('Comment on post', post.id)}
              onPressShare={() => console.log('Share post', post.id)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    backgroundColor: colors.blueButton,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    marginRight: spacing.sm,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.card,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.card,
    opacity: 0.8,
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    margin: spacing.md,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    marginRight: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  infoDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: colors.subtext,
    marginLeft: spacing.xs,
  },
  metaSeparator: {
    fontSize: 12,
    color: colors.subtext,
    marginHorizontal: spacing.xs,
  },
  eventsCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  eventMeta: {
    fontSize: 12,
    color: colors.subtext,
  },
  composerCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  composerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  composerInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  composerActions: {
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  updatesSection: {
    paddingHorizontal: spacing.md,
  },
});