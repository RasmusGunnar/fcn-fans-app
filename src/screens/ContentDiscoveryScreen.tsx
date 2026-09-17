import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/ui';
import { InlineComments } from '../components/comments/InlineComments';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { defaultTheme as theme } from '../theme';
import {
  fetchContentStories,
  laneLabels,
  statusLabels,
  trustLabel,
  type ContentLane,
  type ContentStory,
} from '../services/contentDiscoveryApi';

function Cover({ story }: { story: ContentStory }) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      accessibilityLabel={story.title}
      source={
        story.image_url && !failed
          ? { uri: story.image_url }
          : require('../../assets/stadium-hero.png')
      }
      onError={() => setFailed(true)}
      style={styles.cover}
    />
  );
}
const openSource = (url: string) =>
  Linking.openURL(url).catch(() =>
    Alert.alert('Linket kunne ikke åbnes', 'Prøv igen om lidt.'),
  );
export default function ContentDiscoveryScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>(),
    route = useRoute();
  const storyId = (route.params as { storyId?: string } | undefined)?.storyId;
  const { user, isAppAdmin } = useAuth();
  const [lane, setLane] = useState<ContentLane>('news'),
    [stories, setStories] = useState<ContentStory[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(false);
      fetchContentStories(storyId ? null : lane, storyId ?? null)
        .then((rows) => {
          if (active) setStories(rows);
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [lane, storyId]),
  );
  const story = storyId ? stories[0] : null;
  async function like() {
    if (!story || pending) return;
    if (!user) {
      Alert.alert('Log ind', 'Log ind for at deltage i samtalen.');
      return;
    }
    setPending(true);
    try {
      const { data, error: failure } = await supabase.rpc(
        'set_content_story_like',
        { p_story: story.id, p_liked: !story.liked_by_me },
      );
      if (failure) throw failure;
      setStories((rows) =>
        rows.map((row) =>
          row.id === story.id
            ? { ...row, likes_count: data.count, liked_by_me: data.liked }
            : row,
        ),
      );
    } catch {
      Alert.alert('Reaktionen kunne ikke gemmes', 'Prøv igen.');
    } finally {
      setPending(false);
    }
  }
  return (
    <View style={styles.screen}>
      <AppHeader
        title={storyId ? 'Historien' : 'FCN Discovery'}
        showProfileButton={false}
      />
      <Pressable
        accessibilityRole="button"
        style={styles.back}
        onPress={() => navigation.goBack()}
      >
        <Text variant="bodyBold" color="primary">
          ← Tilbage
        </Text>
      </Pressable>
      {!storyId ? (
        <View style={styles.tabs}>
          {(Object.keys(laneLabels) as ContentLane[]).map((value) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: lane === value }}
              key={value}
              onPress={() => setLane(value)}
              style={[styles.tab, lane === value && styles.active]}
            >
              <Text variant="caption">{laneLabels[value]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator accessibilityLabel="Henter indhold" />
      ) : error ? (
        <Text style={styles.message}>
          Indholdet kunne ikke hentes. Gå tilbage og prøv igen.
        </Text>
      ) : story ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Cover key={story.image_url} story={story} />
          <Text style={styles.label}>{trustLabel(story)}</Text>
          <Text variant="h2">{story.title}</Text>
          <Text style={styles.summary}>{story.summary}</Text>
          {story.editorial_status ? (
            <Text variant="bodyBold">
              {statusLabels[story.editorial_status]}
            </Text>
          ) : null}
          {story.lane === 'radar' ? (
            <Text style={styles.summary}>
              Social omtale er ikke i sig selv en bekræftet nyhed. Læs den
              oprindelige kilde.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              selected: story.liked_by_me,
              disabled: pending,
            }}
            disabled={pending}
            onPress={() => void like()}
            style={styles.action}
          >
            <Text variant="bodyBold" color="primary">
              {story.liked_by_me ? '♥' : '♡'} {story.likes_count} synes godt om
              · {story.comments_count} kommentarer
            </Text>
          </Pressable>
          {user ? (
            <InlineComments
              targetType={story.target_type}
              targetId={story.target_id}
              currentUserId={user.id}
              isAppAdmin={isAppAdmin}
              maxInlineComments={10}
              onNewComment={() =>
                setStories((rows) =>
                  rows.map((row) =>
                    row.id === story.id
                      ? { ...row, comments_count: row.comments_count + 1 }
                      : row,
                  ),
                )
              }
            />
          ) : (
            <Text>Log ind for at se og skrive kommentarer.</Text>
          )}
          <Text variant="h3" style={styles.label}>
            {story.lane === 'podcast'
              ? 'Lyt hos udgiveren'
              : 'Kilder og udvikling'}
          </Text>
          {story.sources.map((source) => (
            <View key={source.id} style={styles.source}>
              <Text variant="bodyBold">
                {source.podcast_name ?? source.name}
              </Text>
              <Text>{source.title}</Text>
              {source.published_at ? (
                <Text variant="caption">
                  {new Date(source.published_at).toLocaleString('da-DK')}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="link"
                style={styles.action}
                onPress={() => void openSource(source.url)}
              >
                <Text variant="bodyBold" color="primary">
                  {story.lane === 'podcast'
                    ? 'Lyt hos udgiveren ↗'
                    : 'Læs originalen ↗'}
                </Text>
              </Pressable>
              {source.chapters?.map((chapter, i) => (
                <Text variant="caption" key={i}>
                  {chapter.startTime} · {chapter.title}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <Text>
              Ingen publicerede indlæg endnu. Kun redaktionelt godkendt indhold
              vises her.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Åbn samtalen: ' + item.title}
              style={styles.card}
              onPress={() =>
                navigation.navigate('ContentStory', { storyId: item.id })
              }
            >
              <Cover story={item} />
              <View style={styles.cardBody}>
                <Text style={styles.label}>{trustLabel(item)}</Text>
                <Text variant="h3">{item.title}</Text>
                <Text numberOfLines={3} style={styles.summary}>
                  {item.summary}
                </Text>
                <Text variant="caption">
                  {item.sources[0]?.podcast_name ?? item.sources[0]?.name} ·{' '}
                  {item.comments_count} kommentarer
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg.default },
  back: {
    minHeight: theme.spacing[11],
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[5],
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
  tab: {
    minHeight: theme.spacing[11],
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.pill,
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.border.default,
  },
  active: {
    backgroundColor: theme.colors.pill.red.bg,
    borderColor: theme.colors.primary,
  },
  content: { padding: theme.spacing[5], paddingBottom: theme.spacing[16] },
  message: { padding: theme.spacing[5] },
  card: {
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing[5],
  },
  cardBody: { padding: theme.spacing[3] },
  cover: { width: '100%', aspectRatio: 2 },
  label: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    marginVertical: theme.spacing[3],
  },
  summary: { marginVertical: theme.spacing[3] },
  action: {
    minHeight: theme.spacing[11],
    justifyContent: 'center',
    paddingVertical: theme.spacing[2],
  },
  source: {
    borderTopWidth: theme.border.hairline,
    borderColor: theme.colors.border.default,
    paddingVertical: theme.spacing[3],
  },
});
