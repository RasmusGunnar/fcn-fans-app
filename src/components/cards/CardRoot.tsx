import React from 'react';
import { FeedCardShell } from '../feed/FeedCardShell';

export type CardRootProps = {
  targetType: 'post' | 'news' | 'event' | 'bus_trip' | 'match' | string;
  targetId: string;
  currentUserId?: string;
  isAppAdmin?: boolean;
  onOpenDetail?: () => void;

  actions?: {
    liked: boolean;
    likes: number;
    comments: number;
    onToggleLike: () => void;
    onPressShare?: () => void;
  };

  commentPreviews?: any[];
  onNewComment?: (comment: any) => void;

  children: React.ReactNode;
};

export function CardRoot(props: CardRootProps) {
  return <FeedCardShell {...props}>{props.children}</FeedCardShell>;
}
