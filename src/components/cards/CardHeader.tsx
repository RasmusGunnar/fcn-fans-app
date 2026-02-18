import React from 'react';
import { FeedCardHeader } from '../FeedCardHeader';

export type CardHeaderProps = {
  nameLine?: string | null;
  fallbackTitle?: string;
  subtitle?: string | undefined;
  avatarSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
};

export function CardHeader({
  nameLine,
  fallbackTitle,
  subtitle,
  avatarSlot,
  rightSlot,
}: CardHeaderProps) {
  const title = nameLine ?? fallbackTitle;

  return (
    <FeedCardHeader
      title={title ?? undefined}
      subtitle={subtitle ?? undefined}
      avatarSlot={avatarSlot}
      rightSlot={rightSlot}
    />
  );
}
