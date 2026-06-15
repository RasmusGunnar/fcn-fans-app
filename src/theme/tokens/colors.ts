export const lightColors = {
  // Brand colors
  primary: '#D8001D',
  primaryDark: '#B00016',
  brand: {
    gold: '#B89C59',
    fcnYellow: '#FFBF24',
    accent: '#E30613',
    muted: '#EDE9E2',
  },

  // Background colors
  bg: {
    default: '#F8F7F4',
    card: '#FFFFFF',
    surface: '#FFFEFC',
    elevated: '#FFFFFF',
    canvas: '#F3F1ED',
    subtle: '#EEEAE3',
  },

  // Text colors
  text: {
    primary: '#1F1F1F',
    secondary: '#5F5F5F',
    muted: '#8A8A8A',
    inverse: '#FFFFFF',
    error: '#E30613',
    onSolid: '#FFFFFF',
  },

  // Border colors
  border: {
    default: '#E3DED6',
    light: '#EFEAE3',
    subtle: '#EAE5DD',
    active: '#E30613',
    hairline: '#EFEAE3',
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
    green: {
      bg: '#E7F7EC',
      text: '#0F7A2F',
      border: '#BFE6CC',
    },
    orange: {
      bg: '#FFF7ED',
      text: '#C2410C',
    },
    neutral: {
      bg: '#F0ECE6',
      text: '#4B4B4B',
    },
    yellow: {
      bg: '#F9EAC3',
      text: '#92400E',
    },
  },

  badges: {
    event: '#FFBF24',
    eventSoftBg: 'rgba(255, 191, 36, 0.15)',
    eventBorder: 'rgba(255, 191, 36, 0.40)',
    busTrip: '#F97316',
    busTripSoftBg: 'rgba(249, 115, 22, 0.15)',
    busTripBorder: 'rgba(249, 115, 22, 0.40)',
  },

  // Special backgrounds
  spotifyGreen: '#1DB954',
  ctaBg: '#F6EEDB',

  // Overlay colors for modals and sheets
  overlay: {
    welcomeGradientTop: 'rgba(0, 0, 0, 0.06)',
    welcomeGradientMiddle: 'rgba(0, 0, 0, 0.34)',
    welcomeGradientBottom: 'rgba(0, 0, 0, 0.72)',
    light: 'rgba(0, 0, 0, 0.3)',
    medium: 'rgba(0, 0, 0, 0.4)',
    fullscreen: 'rgba(10, 10, 10, 0.98)',
    heroScrim: 'rgba(0, 0, 0, 0.45)',
    heavy: 'rgba(0, 0, 0, 0.5)',
    textShadow: 'rgba(0, 0, 0, 0.6)',
  },
};

export const darkColors = {
  // Brand colors
  primary: '#D8001D',
  primaryDark: '#B00016',
  brand: {
    gold: '#B89C59',
    fcnYellow: '#FFBF24',
    accent: '#E30613',
    muted: '#374151',
  },

  // Background colors
  bg: {
    default: '#0F172A',
    card: '#111827',
    surface: '#111827',
    elevated: '#1F2937',
    canvas: '#0B1120',
    subtle: '#111827',
  },

  // Text colors
  text: {
    primary: '#F9FAFB',
    secondary: '#D1D5DB',
    muted: '#9CA3AF',
    inverse: '#111827',
    error: '#E30613',
    onSolid: '#FFFFFF',
  },

  // Border colors
  border: {
    default: '#2A3240',
    light: '#334155',
    subtle: '#303949',
    active: '#E30613',
    hairline: '#303949',
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
    green: {
      bg: '#14532D',
      text: '#BBF7D0',
      border: '#166534',
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

  badges: {
    event: '#FFBF24',
    eventSoftBg: 'rgba(255, 191, 36, 0.15)',
    eventBorder: 'rgba(255, 191, 36, 0.40)',
    busTrip: '#F97316',
    busTripSoftBg: 'rgba(249, 115, 22, 0.15)',
    busTripBorder: 'rgba(249, 115, 22, 0.40)',
  },

  // Special backgrounds
  spotifyGreen: '#1DB954',
  ctaBg: '#78350F',

  // Overlay colors for modals and sheets
  overlay: {
    welcomeGradientTop: 'rgba(0, 0, 0, 0.06)',
    welcomeGradientMiddle: 'rgba(0, 0, 0, 0.34)',
    welcomeGradientBottom: 'rgba(0, 0, 0, 0.72)',
    light: 'rgba(0, 0, 0, 0.3)',
    medium: 'rgba(0, 0, 0, 0.4)',
    fullscreen: 'rgba(10, 10, 10, 0.98)',
    heroScrim: 'rgba(0, 0, 0, 0.45)',
    heavy: 'rgba(0, 0, 0, 0.5)',
    textShadow: 'rgba(0, 0, 0, 0.6)',
  },
};

export type ColorTokens = typeof lightColors;
