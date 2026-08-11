import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseInstagramUrl } from '../../lib/instagram';
import { useTheme, type Theme } from '../../theme';
import type { InstagramEmbedReady } from '../../types/instagramEmbed';
import {
  buildInstagramEmbedDocument,
  INSTAGRAM_EMBED_INITIAL_HEIGHT,
  isAllowedInstagramEmbedNavigation,
  parseInstagramEmbedHeightMessage,
} from '../../utils/instagramEmbed';

type InstagramEmbedRendererProps = {
  embed: InstagramEmbedReady;
  onFailure?: () => void;
};

export function InstagramEmbedRenderer({ embed, onFailure }: InstagramEmbedRendererProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const document = useMemo(() => buildInstagramEmbedDocument(embed.html), [embed.html]);
  const [height, setHeight] = useState(INSTAGRAM_EMBED_INITIAL_HEIGHT);

  useEffect(() => {
    setHeight(INSTAGRAM_EMBED_INITIAL_HEIGHT);
  }, [embed.canonicalUrl]);

  useEffect(() => {
    if (!document) onFailure?.();
  }, [document, onFailure]);

  if (!document) return null;

  return (
    <View style={[styles.shell, { height }]}>
      <WebView
        source={{ html: document, baseUrl: 'https://www.instagram.com/' }}
        originWhitelist={['about:blank', 'https://www.instagram.com/*']}
        style={styles.webView}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled={false}
        incognito
        cacheEnabled={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        mixedContentMode="never"
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback
        onMessage={({ nativeEvent }) => {
          const nextHeight = parseInstagramEmbedHeightMessage(nativeEvent.data);
          if (nextHeight !== null) setHeight(nextHeight);
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (isAllowedInstagramEmbedNavigation(request.url)) return true;
          if (request.isTopFrame === false) return false;
          const external = parseInstagramUrl(request.url);
          if (external) {
            void Linking.openURL(external.canonicalUrl).catch(() => undefined);
          }
          return false;
        }}
        onError={onFailure}
        onHttpError={onFailure}
        onContentProcessDidTerminate={onFailure}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    shell: {
      overflow: 'hidden',
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
    },
    webView: { flex: 1, backgroundColor: theme.colors.bg.card },
  });
}
