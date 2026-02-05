import React from 'react';

export interface CardMediaProps {
  aspectRatio: number;
  children: React.ReactNode;
}

export function CardMedia({ children }: CardMediaProps) {
  return <>{children}</>;
}
