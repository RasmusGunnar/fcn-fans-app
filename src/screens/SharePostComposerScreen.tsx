import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MessageScreenHeader } from '../components/messages/MessageScreenHeader';
import { PostComposer } from '../components/PostComposer';
import { useTheme, type Theme } from '../theme';
import type { SharedLinkAttachment } from '../types/externalShare';

type SharePostComposerRoute = { params?: { externalShare?: SharedLinkAttachment } };

export default function SharePostComposerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute() as SharePostComposerRoute;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const externalShare = route.params?.externalShare;

  return (
    <View style={styles.container}>
      <MessageScreenHeader title="Del som opslag" onBack={() => navigation.goBack()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <PostComposer
          initialExternalShare={externalShare}
          feedTargets={['home']}
          onSuccess={() => navigation.replace('Main')}
        />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg.default },
    content: { paddingBottom: theme.spacing[8] },
  });
}
