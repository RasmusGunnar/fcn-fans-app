import React from 'react';
import { Button } from './Button';

interface OutlineButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: string;
}

/**
 * Legacy OutlineButton component - wraps new Button component for backwards compatibility
 * @deprecated Use Button variant="outline" instead
 */
export function OutlineButton({ title, onPress, disabled = false, icon }: OutlineButtonProps) {
  // Note: icon prop is ignored in new Button - consider using IconButton instead
  return <Button title={title} onPress={onPress} disabled={disabled} variant="outline" />;
}
