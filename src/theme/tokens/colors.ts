export const lightColors = {
  // Brand colors
  primary: '#D8001D',
  primaryDark: '#B00016',
  brand: {
    gold: '#B89C59',
    accent: '#E30613',
    muted: '#F0F0F0',
  },

  // Background colors
  bg: {
    default: '#FFFFFF',
    card: '#FFFFFF',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    canvas: '#F5F5F5',
    subtle: '#F0F0F0',
  },

  // Text colors
  text: {
    primary: '#1A1A1A',
    secondary: '#666666',
    muted: '#9CA3AF',
    inverse: '#FFFFFF',
    error: '#E30613',
  },

  // Border colors
  border: {
    default: '#EBEBEB',
    light: '#F3F4F6',
    subtle: '#F2F2F2',
    active: '#E30613',
    hairline: '#F2F2F2',
  },

  // Semantic colors
  success: '#1DB954',
  warning: '#C2410C',
  error: '#DC2626',
  info: '#2563EB',

  // State colors (aliases for common use cases)
  state: {
    success: '#34C759',
    warning: '#FF9500',
    error: '#DC2626',
    info: '#2563EB',
  },

  // Pill colors
  pill: {
    red: {
      bg: '#FDE7EA',
      text: '#B00016',
    },
    orange: {
      bg: '#FFF7ED',
      text: '#C2410C',
    },
    neutral: {
      bg: '#F3F4F6',
      text: '#374151',
    },
    yellow: {
      bg: '#FBF2D5',
      text: '#92400E',
    },
  },

  // Special backgrounds
  spotifyGreen: '#1DB954',
  ctaBg: '#F7EED6',

  // Overlay colors for modals and sheets
  overlay: {
    light: 'rgba(0, 0, 0, 0.3)',
    medium: 'rgba(0, 0, 0, 0.4)',
    heavy: 'rgba(0, 0, 0, 0.5)',
  },
};

export const darkColors = {
  // Brand colors
  primary: '#D8001D',
  primaryDark: '#B00016',
  brand: {
    gold: '#B89C59',
    accent: '#E30613',
    muted: '#374151',
  },

  // Background colors
  bg: {
    default: '#111827',
    card: '#1F2937',
    surface: '#1F2937',
    elevated: '#374151',
    canvas: '#0F172A',
    subtle: '#1F2937',
  },

  // Text colors
  text: {
    primary: '#F9FAFB',
    secondary: '#D1D5DB',
    muted: '#9CA3AF',
    inverse: '#111827',
    error: '#E30613',
  },

  // Border colors
  border: {
    default: '#374151',
    light: '#4B5563',
    subtle: '#4B5563',
    active: '#E30613',
    hairline: '#4B5563',
  },

  // Semantic colors
  success: '#1DB954',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // State colors (aliases for common use cases)
  state: {
    success: '#34C759',
    warning: '#FF9500',
    error: '#EF4444',
    info: '#3B82F6',
  },

  // Pill colors
  pill: {
    red: {
      bg: '#7F1D1D',
      text: '#FCA5A5',
    },
    orange: {
      bg: '#7C2D12',
      text: '#FED7AA',
    },
    neutral: {
      bg: '#374151',
      text: '#D1D5DB',
    },
    yellow: {
      bg: '#78350F',
      text: '#FDE68A',
    },
  },

  // Special backgrounds
  spotifyGreen: '#1DB954',
  ctaBg: '#78350F',

  // Overlay colors for modals and sheets
  overlay: {
    light: 'rgba(0, 0, 0, 0.3)',
    medium: 'rgba(0, 0, 0, 0.4)',
    heavy: 'rgba(0, 0, 0, 0.5)',
  },
};

export type ColorTokens = typeof lightColors;
