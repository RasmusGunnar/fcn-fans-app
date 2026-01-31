export const gradients = {
  imageHeaderOverlay: {
    colors: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.7)'],
    locations: [0, 1],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
  primary: {
    colors: ['#D8001D', '#B00016'],
    locations: [0, 1],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
} as const;

export type GradientTokens = typeof gradients;
