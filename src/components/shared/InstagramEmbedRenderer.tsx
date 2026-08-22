import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme, type Theme } from '../../theme';
import type { InstagramEmbedReady } from '../../types/instagramEmbed';
import {
  buildInstagramEmbedDocument,
  INSTAGRAM_EMBED_INITIAL_HEIGHT,
  parseInstagramEmbedHeightMessage,
} from '../../utils/instagramEmbed';
import {
  INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT,
  INSTAGRAM_EMBED_ORIGIN_WHITELIST,
  INSTAGRAM_EMBED_SHELL_URL,
  instagramEmbedWebViewNavigationHandlers,
  shouldRecoverInstagramEmbedMainDocument,
} from '../../utils/instagramNavigation';

type InstagramEmbedRendererProps = {
  embed: InstagramEmbedReady;
  onFailure?: () => void;
};

export function InstagramEmbedRenderer({ embed, onFailure }: InstagramEmbedRendererProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const document = useMemo(() => buildInstagramEmbedDocument(embed.html), [embed.html]);
  const [height, setHeight] = useState(INSTAGRAM_EMBED_INITIAL_HEIGHT);
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  const lastRejectedMainDocumentUrl = useRef<string | null>(null);

  useEffect(() => {
    setHeight(INSTAGRAM_EMBED_INITIAL_HEIGHT);
    setNavigationEpoch(0);
    lastRejectedMainDocumentUrl.current = null;
  }, [embed.canonicalUrl]);

  useEffect(() => {
    if (!document) onFailure?.();
  }, [document, onFailure]);

  if (!document) return null;

  return (
    <View style={[styles.shell, { height }]}>
      <WebView
        key={`${embed.canonicalUrl}:${navigationEpoch}`}
        source={{ html: document, baseUrl: INSTAGRAM_EMBED_SHELL_URL }}
        originWhitelist={INSTAGRAM_EMBED_ORIGIN_WHITELIST}
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
        setSupportMultipleWindows
        injectedJavaScriptBeforeContentLoaded={INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        allowsLinkPreview={false}
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback
        onMessage={({ nativeEvent }) => {
          const nextHeight = parseInstagramEmbedHeightMessage(nativeEvent.data);
          if (nextHeight !== null) setHeight(nextHeight);
        }}
        onShouldStartLoadWithRequest={
          instagramEmbedWebViewNavigationHandlers.onShouldStartLoadWithRequest
        }
        onOpenWindow={instagramEmbedWebViewNavigationHandlers.onOpenWindow}
        onNavigationStateChange={({ url }) => {
          // onShouldStartLoadWithRequest is the preventative gate. This recovers
          // if Android's asynchronous native gate ever times out or lacks frame metadata.
          if (!shouldRecoverInstagramEmbedMainDocument(url)) {
            lastRejectedMainDocumentUrl.current = null;
            return;
          }
          if (lastRejectedMainDocumentUrl.current === url) return;
          lastRejectedMainDocumentUrl.current = url;
          setNavigationEpoch((value) => value + 1);
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
