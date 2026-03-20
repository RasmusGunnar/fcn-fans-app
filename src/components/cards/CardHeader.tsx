import React from 'react';
import { FeedCardHeader } from '../FeedCardHeader';

export type CardHeaderProps = {
  nameLine?: string | null;
  fallbackTitle?: string;
  subtitle?: string | undefined;
  avatarSlot?: React.ReactNode;
  inlineBadge?: React.ReactNode;
  rightSlot?: React.ReactNode;
  onPressAuthor?: () => void;
};

export function CardHeader({
  nameLine,
  fallbackTitle,
  subtitle,
  avatarSlot,
  inlineBadge,
  rightSlot,
  onPressAuthor,
}: CardHeaderProps) {
  const title = nameLine ?? fallbackTitle;

  return (
    <FeedCardHeader
      title={title ?? undefined}
      subtitle={subtitle ?? undefined}
      avatarSlot={avatarSlot}
      inlineBadge={inlineBadge}
      rightSlot={rightSlot}
      onPressAuthor={onPressAuthor}
    />
  );
}
