// Design tokens — single source of truth consumed by every StyleSheet
// in the app (native + web). Values below follow the FRAME design system:
// dark charcoal surfaces, purple (#7c3aed) primary accent, tight radii.
//
// Keeping the token *key names* stable (bg, bgCard, bgElevated, accent…)
// means components don't need to be rewired — they pick up the new palette
// automatically via their existing imports.

export const colors = {
  // ── Surfaces ─────────────────────────────────────────────────────────
  bg: '#0a0a0a',          // page background (--bg-primary)
  bgCard: '#141414',      // card surface (--bg-card)
  bgElevated: '#1a1a1a',  // elevated / modal surface (--bg-elevated)
  bgInput: '#111111',     // text inputs (--bg-input)

  // ── Borders ──────────────────────────────────────────────────────────
  border: '#2a2a2a',        // subtle divider (--border-subtle)
  borderDashed: '#333333',  // dashed drop-zone border (--border-dashed)
  borderFocus: '#7c3aed',   // focused input border (--border-focus)

  // ── Text ─────────────────────────────────────────────────────────────
  textPrimary: '#ffffff',    // (--text-primary)
  textSecondary: '#a0a0a0',  // (--text-secondary)
  textMuted: '#555555',      // (--text-muted)
  textLabel: '#888888',      // (--text-label) — small caps section labels

  // ── Accent (FRAME purple) ────────────────────────────────────────────
  accent: '#7c3aed',        // primary brand (--purple)
  accentHover: '#6d28d9',   // hover/pressed (--purple-hover)
  accentAlt: '#6d28d9',     // legacy alias for components that read accentAlt
  accentDim: 'rgba(124, 58, 237, 0.15)',  // (--purple-dim)
  accentGlow: 'rgba(124, 58, 237, 0.4)',  // (--purple-glow)

  // ── Semantic ─────────────────────────────────────────────────────────
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',

  // ── Gradients ────────────────────────────────────────────────────────
  // PRO badge / highlight gradient — two shades of the brand purple so the
  // effect reads as a subtle sheen rather than a duotone splash.
  gradientStart: '#7c3aed',
  gradientEnd: '#6d28d9',
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
  // FRAME-style uppercase section labels. Apply as:
  //   { ...typography.label, color: colors.textLabel }
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.88, // ≈0.08em at 11px
    textTransform: 'uppercase' as const,
  },
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

// Corner radii per the FRAME scale (6/10/14/20). Tighter than the previous
// 8/12/16/24 set — reads crisper against the new darker surfaces.
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const shadows = {
  // Purple glow — used on focused/active elements (FRAME --shadow-purple).
  glow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  // Card drop shadow — FRAME --shadow-card.
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 6,
  },
  // Elevated (modals, popovers) — FRAME --shadow-elevated.
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 12,
  },
};
