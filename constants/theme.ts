export const colors = {
  bg: '#0B0B0F',
  bgElevated: '#15151C',
  bgCard: '#1C1C26',
  border: '#2A2A36',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0B0',
  textMuted: '#6E6E80',
  accent: '#FF2E93',
  accentAlt: '#7C3AED',
  accentGlow: '#FF2E93AA',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  gradientStart: '#FF2E93',
  gradientEnd: '#7C3AED',
} as const;

export const typography = {
  display: { fontSize: 40, fontWeight: '900' as const, letterSpacing: -1.5 },
  h1: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1 },
  h2: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.5 },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  bodyBold: { fontSize: 15, fontWeight: '700' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Phone-ish max width for the main scrollable content on web. On mobile this
// is bigger than the device width so width:'100%' wins; on a large browser
// window it keeps images from ballooning to 2000px wide.
export const layout = {
  maxContentWidth: 520,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const shadows = {
  glow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
};
