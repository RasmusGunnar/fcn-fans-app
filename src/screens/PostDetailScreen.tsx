import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../theme';
import { AppHeader } from '../components/AppHeader';
import { useFeed } from '../state/FeedContext';
import { FanPostCard } from '../components/cards/FanPostCard';

export default function PostDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute() as any;
  const postId: string = route?.params?.postId ?? route?.params?.id;
  const { posts, profileMap, removePost } = useFeed();
  const post = posts.find((p) => p.id === postId);
  const authorProfile = post?.authorId ? profileMap[post.authorId] : undefined;

  const handleDeleted = (deletedPostId: string) => {
    removePost(deletedPostId);
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container}>
      <AppHeader title="Opslag" subtitle="" />
      <View style={styles.content}>
        {post && (
          <FanPostCard post={post} authorProfile={authorProfile} onDeleted={handleDeleted} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md },
});
