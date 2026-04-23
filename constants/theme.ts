// Design tokens — single source of truth consumed by every StyleSheet
// in the app (native + web). Values below are the exact FRAME design
// system palette: near-black surfaces in a violet-tinged charcoal ramp,
// off-white body text, and the purple accent reserved for interactive /
// focused state.
//
// Token *keys* are kept stable (bg, bgCard, bgElevated, accent, …) so
// existing components don't need rewiring — they pick up the new values
// through their existing imports.

export const colors = {
  // ── Surfaces ─────────────────────────────────────────────────────────
  // FRAME's four-stop dark ramp. `bg` is the page / app-shell background;
  // `bgCard` is the standard card; `bgElevated` is for modals, headers and
  // the tab bar; `bgInput` is the deepest stop, used for inputs and the
  // drop-zone surface so those controls recess into the page.
  bg: '#09090d',          // page background        — FRAME surface-900
  bgCard: '#18181f',      // card                   — FRAME surface-800
  bgElevated: '#1f1f29',  // elevated / modal       — FRAME surface-700
  bgInput: '#27272f',     // input / hover surface  — FRAME surface-600

  // ── Borders ──────────────────────────────────────────────────────────
  border: '#27272f',        // subtle divider on dark surfaces
  borderDashed: '#44445a',  // dashed drop-zone border (text-muted tone)
  borderFocus: '#7c3aed',   // focused input / active control

  // ── Text ─────────────────────────────────────────────────────────────
  textPrimary: '#f0f0f5',    // body / headline        — FRAME text-100
  textSecondary: '#7070a0',  // secondary / meta       — FRAME text-300
  textMuted: '#44445a',      // disabled / dividers    — FRAME text-500
  textLabel: '#7070a0',      // uppercase section labels — same as secondary

  // ── Accent (FRAME purple) ────────────────────────────────────────────
  accent: '#7c3aed',        // primary brand — violet-600
  accentHover: '#6d28d9',   // hover/pressed — violet-700
  accentAlt: '#6d28d9',     // legacy alias
  accentDim: 'rgba(124, 58, 237, 0.15)',  // violet-600/15 — label-tag bg
  accentGlow: 'rgba(124, 58, 237, 0.4)',  // violet-600/40 — focus ring
  // Brighter violet used for label-tag text so it reads on the accentDim
  // background (a direct #7c3aed on violet-600/15 doesn't have enough
  // contrast; FRAME uses violet-300).
  accentText: '#c4b5fd',

  // ── Semantic ─────────────────────────────────────────────────────────
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  // Error banner pattern — red-500 tinted bg + border so the banner reads
  // as an inline alert rather than a solid red surface. Text uses red-400
  // for softer contrast against the tint.
  dangerBg: 'rgba(239, 68, 68, 0.1)',
  dangerBorder: 'rgba(239, 68, 68, 0.3)',
  dangerText: '#f87171',

  // ── Gradients ────────────────────────────────────────────────────────
  // PRO badge / highlight gradient — two shades of the brand purple so the
  // effect reads as a subtle sheen rather than a duotone splash.
  gradientStart: '#7c3aed',
  gradientEnd: '#6d28d9',
} as const;

// FRAME uses Inter for UI and JetBrains Mono for the brand wordmark and
// monospace accents. The `mono` key returns a `fontFamily` string that's
// safe on every platform: on web the `app/+html.tsx` document loads JetBrains
// Mono from Google Fonts, on iOS/Android the built-in monospace family kicks
// in if the font isn't bundled — either way it stays readable.
export const fontFamily = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, Monaco, "Courier New", monospace',
};

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
    letterSpacing: 1.2, // wider than before to read as a FRAME label
    textTransform: 'uppercase' as const,
  },
  // JetBrains Mono wordmark — used for the "What If" logo in FRAME spec.
  mono: {
    fontFamily: fontFamily.mono,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
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

// FRAME radii scale — tighter and more consistent than before.
//   lg  (8)  — default buttons, inputs
//   xl  (12) — cards, chips
//   xxl (16) — drop-zone, large panels
//   pill (full) — tab bar pills, badges
export const radii = {
  sm: 6,
  md: 8,
  lg: 8,
  xl: 12,
  xxl: 16,
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
