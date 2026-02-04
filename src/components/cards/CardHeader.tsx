import React from 'react';
import { FeedCardHeader } from '../FeedCardHeader';
import type { CategoryKey } from '../../theme/categories';

export type CardHeaderProps = {
  categoryKey: CategoryKey;
  nameLine?: string | null;
  fallbackTitle?: string;
  subtitle?: string | null;
  avatarSlot?: React.ReactNode;
};

export function CardHeader({
  categoryKey,
  nameLine,
  fallbackTitle,
  subtitle,
  avatarSlot,
}: CardHeaderProps) {
  const title = nameLine ?? fallbackTitle;

  return (
    <FeedCardHeader
      categoryKey={categoryKey}
      title={title ?? undefined}
      subtitle={subtitle ?? undefined}
      avatarSlot={avatarSlot}
    />
  );
}
