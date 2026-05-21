// Custom HTML document for the web build (Expo Router `+html.tsx`).
// Native platforms (iOS/Android) ignore this file — it's only consumed by
// the metro web bundler. We use it to:
//   1. Carry the FRAME CSS variables so any web-only chrome (scrollbars,
//      form elements, body default bg) can reference them.
//   2. Load Inter + JetBrains Mono from Google Fonts.
//   3. Set a global dark body background so there's no white flash on load.
//   4. Style the browser scrollbar to match the dark surfaces.
//
// React Native StyleSheet already handles per-component styling for both
// web and native — the CSS below only covers things StyleSheet can't reach.

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#09090d" />

        {/* Default page title + description. Individual screens can
            override via expo-router's <Head> or by setting document.title
            imperatively if a per-screen title becomes important; this is
            the fallback for direct loads / social-share cards. */}
        <title>What If — AI photo transformations</title>
        <meta
          name="description"
          content="Drop a photo, pick a direction (race, age, gender, mashups, military uniforms), and see yourself across the multiverse — AI photo transformations made fun."
        />

        {/* Open Graph + Twitter Card tags. When the URL is pasted into
            a chat or social post, this is what the unfurl looks like.
            og:image is omitted intentionally — no branded share asset
            exists yet; adding a default would mean shipping a
            placeholder that's worse than the platform's default
            "no preview" treatment. Wire it up when there's a real
            shareable hero image. */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="What If — AI photo transformations" />
        <meta
          property="og:description"
          content="Drop a photo. Pick a direction. See yourself across the multiverse."
        />
        <meta property="og:site_name" content="What If" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="What If — AI photo transformations" />
        <meta
          name="twitter:description"
          content="Drop a photo. Pick a direction. See yourself across the multiverse."
        />

        {/* Apple-specific PWA chrome. theme-color above handles Android.
            apple-mobile-web-app-capable lets users save to home screen
            without browser chrome. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="What If" />


        {/* Inter — FRAME's UI font. JetBrains Mono — FRAME's wordmark / mono
            accents. System fallbacks keep things readable before the web
            fonts land. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />

        {/* Expo Router's recommended reset — normalizes ScrollView bounce on web. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: FRAME_GLOBAL_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// FRAME design-system CSS. Variables mirror `constants/theme.ts` so web
// chrome and React Native StyleSheet stay in sync.
const FRAME_GLOBAL_CSS = `
:root {
  --bg-primary: #09090d;
  --bg-card: #18181f;
  --bg-elevated: #1f1f29;
  --bg-input: #27272f;
  --border-subtle: #27272f;
  --border-dashed: #44445a;
  --border-focus: #7c3aed;
  --purple: #7c3aed;
  --purple-hover: #6d28d9;
  --purple-dim: rgba(124, 58, 237, 0.15);
  --purple-glow: rgba(124, 58, 237, 0.4);
  --violet-300: #c4b5fd;
  --text-primary: #f0f0f5;
  --text-secondary: #7070a0;
  --text-muted: #44445a;
  --text-label: #7070a0;
  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --shadow-card: 0 4px 24px rgba(0,0,0,0.4);
  --shadow-elevated: 0 8px 40px rgba(0,0,0,0.6);
  --shadow-purple: 0 0 20px rgba(124,58,237,0.3);
}

* { box-sizing: border-box; }

html, body, #root {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  margin: 0;
  padding: 0;
  min-height: 100%;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Match the dark theme in scrollbars so they don't flash a white track. */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* Unstyled native form elements on web get a browser-default light chrome —
   force the FRAME palette so they fit the app. React Native <TextInput/>
   renders as a <input/> on web, so this reaches those too. */
input, textarea, select, button {
  font-family: inherit;
  color: inherit;
}

input::placeholder, textarea::placeholder {
  color: var(--text-muted);
}

/* Focus outline — purple ring matching FRAME spec. */
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--purple-dim);
}

/* Kill the default blue link color — everything in-app is either off-white,
   grey, or purple. */
a { color: var(--purple); text-decoration: none; }
a:hover { color: var(--purple-hover); }

/* React Native Web renders Pressable as a <div role="button">. Browsers
   don't set cursor: pointer on those automatically, so without this the
   entire interactive surface of the app reads as non-clickable on
   desktop web. The selector covers Pressable's various output shapes
   (role="button" / role="switch" / role="link") so every interactive
   primitive gets the right cursor. Disabled elements explicitly
   override with cursor: not-allowed so the affordance matches the
   semantic state. */
[role="button"]:not([aria-disabled="true"]),
[role="link"]:not([aria-disabled="true"]),
[role="switch"]:not([aria-disabled="true"]),
[role="tab"]:not([aria-disabled="true"]) {
  cursor: pointer;
}
[role="button"][aria-disabled="true"],
[role="link"][aria-disabled="true"],
[role="switch"][aria-disabled="true"] {
  cursor: not-allowed;
}

/* Focus-visible outline for keyboard navigation. Only triggers on
   keyboard focus (not mouse), so the click-driven press feedback
   isn't doubled up with a ring. Mirrors the input:focus treatment
   above so the focused state reads as the same visual language across
   form fields and interactive surfaces. */
[role="button"]:focus-visible,
[role="link"]:focus-visible,
[role="switch"]:focus-visible,
[role="tab"]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--purple-glow);
  border-radius: var(--radius-lg);
}

/* Stop the OS-default tap-highlight rectangle and text-selection
   flicker on press. Both are mobile-Safari and Chrome-Android
   artifacts that fight the in-app press feedback. */
[role="button"], [role="link"], [role="switch"], [role="tab"] {
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

/* Reduced motion. Users with the system preference enabled get a hard
   ceiling on every CSS transition + animation. Our in-app Reanimated
   animations independently check AccessibilityInfo.isReduceMotionEnabled
   (see CategoryCard, ResultCard, PulseIndicators), but this catches
   any third-party / native HTML animations (e.g. expo-router page
   transitions on web) that don't hit the RN-Web layer. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Selection color — purple-tinted so highlights match the app palette
   rather than the OS-default blue. */
::selection {
  background-color: var(--purple-dim);
  color: var(--text-primary);
}
`;
