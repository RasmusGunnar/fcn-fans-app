import React from 'react';
import { FeedCardShell } from '../feed/FeedCardShell';

export type CardRootProps = React.ComponentProps<typeof FeedCardShell>;

export function CardRoot(props: CardRootProps) {
  return <FeedCardShell {...props}>{props.children}</FeedCardShell>;
}
