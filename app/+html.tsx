// Custom HTML document for the web build (Expo Router `+html.tsx`).
// Native platforms (iOS/Android) ignore this file — it's only consumed by
// the metro web bundler. We use it to:
//   1. Carry the FRAME CSS variables so any web-only chrome (scrollbars,
//      form elements, body default bg) can reference them.
//   2. Load Inter from Google Fonts.
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
        <meta name="theme-color" content="#0a0a0a" />

        {/* Inter — FRAME's body font. System-ui fallback keeps things readable
            before the web font lands. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
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
  --bg-primary: #0a0a0a;
  --bg-card: #141414;
  --bg-elevated: #1a1a1a;
  --bg-input: #111111;
  --border-subtle: #2a2a2a;
  --border-dashed: #333333;
  --border-focus: #7c3aed;
  --purple: #7c3aed;
  --purple-hover: #6d28d9;
  --purple-dim: rgba(124, 58, 237, 0.15);
  --purple-glow: rgba(124, 58, 237, 0.4);
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --text-muted: #555555;
  --text-label: #888888;
  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
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
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
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

/* Kill the default blue link color — everything in-app is either white,
   grey, or purple. */
a { color: var(--purple); text-decoration: none; }
a:hover { color: var(--purple-hover); }
`;
