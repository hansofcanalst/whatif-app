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
`;
