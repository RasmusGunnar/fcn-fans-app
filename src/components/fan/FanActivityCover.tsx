import React, { useState } from 'react';
import { ImageBackground, type ImageBackgroundProps } from 'react-native';

/** cover_url is the shared web/native field; bundled art remains the fallback. */
export function FanActivityCover({ coverUrl, ...props }: ImageBackgroundProps & {
  coverUrl?: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uri = coverUrl?.trim();
  const custom = uri && /^https?:\/\//i.test(uri) && uri !== failedUrl;
  return <ImageBackground {...props} source={custom ? { uri } : props.source}
    onError={event => { if (custom) setFailedUrl(uri); props.onError?.(event); }} />;
}
