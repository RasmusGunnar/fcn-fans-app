import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { InstagramEmbedModal } from '../components/shared/InstagramEmbedModal';
import { InstagramEmbedPreview } from '../components/shared/InstagramEmbedPreview';
import { Button, Text } from '../components/ui';
import { useIncomingShare } from '../state/IncomingShareContext';
import { useTheme, type Theme } from '../theme';

export default function IncomingShareScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { pendingShare, loading, discardPendingShare, takePendingShare } = useIncomingShare();
  const [opening, setOpening] = useState<'post' | 'message' | 'cancel' | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!loading && !pendingShare) navigation.replace('Main');
  }, [loading, navigation, pendingShare]);

  const takeAndOpen = async (destination: 'post' | 'message') => {
    if (!user?.id || opening) return;
    setOpening(destination);
    const share = await takePendingShare();
    if (!share) {
      setOpening(null);
      navigation.replace('Main');
      return;
    }
    if (destination === 'post') {
      navigation.replace('SharePostComposer', { externalShare: share });
    } else {
      navigation.replace('Messages', {
        screen: 'MessagesList',
        params: { externalShare: share },
      });
    }
  };

  const cancel = async () => {
    if (opening) return;
    setOpening('cancel');
    await discardPendingShare();
    navigation.replace('Main');
  };

  if (loading || !pendingShare) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text variant="body" color="secondary">
          Henter delt link…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <Text variant="h2">Del fra Instagram</Text>
          <Text variant="body" color="secondary">
            Vælg, hvor linket skal deles. Intet bliver sendt automatisk.
          </Text>
        </View>
        <InstagramEmbedPreview attachment={pendingShare} onPress={() => setPreviewVisible(true)} />
        {!user ? (
          <Text variant="body" color="secondary" style={styles.loggedOutCopy}>
            Log ind for at fortsætte. Linket gemmes i op til 10 minutter.
          </Text>
        ) : (
          <View style={styles.actions}>
            <Button
              title={opening === 'post' ? 'Åbner…' : 'Del som opslag'}
              onPress={() => void takeAndOpen('post')}
              disabled={Boolean(opening)}
              fullWidth
            />
            <Button
              title={opening === 'message' ? 'Åbner…' : 'Send i besked'}
              onPress={() => void takeAndOpen('message')}
              disabled={Boolean(opening)}
              variant="outline"
              fullWidth
            />
            <Button
              title="Annuller"
              onPress={() => void cancel()}
              disabled={Boolean(opening)}
              variant="ghost"
              fullWidth
            />
          </View>
        )}
        <InstagramEmbedModal
          attachment={pendingShare}
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
        />
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: theme.layout.screenPadding,
      backgroundColor: theme.colors.bg.default,
    },
    content: { gap: theme.spacing[5] },
    heading: { gap: theme.spacing[2] },
    actions: { gap: theme.spacing[3] },
    loggedOutCopy: { textAlign: 'center' },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[3],
      backgroundColor: theme.colors.bg.default,
    },
  });
}
