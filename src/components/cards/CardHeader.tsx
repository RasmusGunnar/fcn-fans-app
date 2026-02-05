import React from 'react';
import { FeedCardHeader } from '../FeedCardHeader';

export type CardHeaderProps = {
  nameLine?: string | null;
  fallbackTitle?: string;
  subtitle?: string | undefined;
  avatarSlot?: React.ReactNode;
};

export function CardHeader({
  nameLine,
  fallbackTitle,
  subtitle,
  avatarSlot,
}: CardHeaderProps) {
  const title = nameLine ?? fallbackTitle;

  return (
    <FeedCardHeader
      title={title ?? undefined}
      subtitle={subtitle ?? undefined}
      avatarSlot={avatarSlot}
    />
  );
}
