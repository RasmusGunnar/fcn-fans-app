import React from 'react';
import { FeedCardHeader } from '../FeedCardHeader';
import { Pill } from '../ui/Pill';

export type CardHeaderProps = {
  categoryLabel: string;
  pillVariant?: any;
  nameLine?: string | null;
  fallbackTitle?: string;
  subtitle?: string | null;
  avatarSlot?: React.ReactNode;
};

export function CardHeader({
  categoryLabel,
  pillVariant,
  nameLine,
  fallbackTitle,
  subtitle,
  avatarSlot,
}: CardHeaderProps) {
  const title = nameLine ?? fallbackTitle;

  return (
    <>
      {pillVariant ? (
        <Pill label={categoryLabel} variant={pillVariant} />
      ) : (
        <Pill label={categoryLabel} />
      )}
      {title ? (
        <FeedCardHeader title={title} subtitle={subtitle ?? null} avatarSlot={avatarSlot} />
      ) : null}
    </>
  );
}
