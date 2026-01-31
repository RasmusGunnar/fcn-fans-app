import React from 'react';
import { Button, ButtonVariant } from './ui';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'red' | 'blue' | 'yellow' | 'outline';
}

/**
 * Legacy PrimaryButton component - wraps new Button component for backwards compatibility
 * @deprecated Use Button from './ui' instead
 */
export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  variant = 'red',
}: PrimaryButtonProps) {
  // Map legacy variants to new Button variants
  const mapVariant = (): ButtonVariant => {
    if (variant === 'outline') return 'outline';
    return 'primary'; // red, blue, yellow all map to primary for now
  };

  return (
    <Button
      title={title}
      onPress={onPress}
      disabled={disabled}
      variant={mapVariant()}
      size="md"
      fullWidth
    />
  );
}
