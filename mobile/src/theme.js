/**
 * Single source of truth for colors / spacing across the app. Mirrors
 * the brand palette from the web's tailwind.config.js so the two
 * surfaces stay visually aligned. Swap these values to re-skin
 * everything; individual screens never hard-code hex.
 */
export const theme = {
  colors: {
    ink: '#0a0a0a',
    bg: '#fff5f9',
    card: '#ffffff',
    border: '#e5e7eb',
    muted: '#6b7280',
    mutedSoft: '#9ca3af',
    tinder: '#ec4899',
    tinderDark: '#db2777',
    brand50: '#fdf2f8',
    brand100: '#fce7f3',
    brand200: '#fbcfe8',
    brand600: '#db2777',
    brand700: '#be185d',
    success: '#22c55e',
    danger: '#ef4444',
    sky: '#0ea5e9',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
};
