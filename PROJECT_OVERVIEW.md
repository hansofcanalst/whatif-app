# What If — Project Overview

A pre-launch project snapshot. Reflects the state of the codebase
on `main` at the time of writing (post-hardening; last hand-authored
commit `2a9050d Pre-launch safety + legal hardening`, then auto-
commits on top). Written by reading every significant source file
rather than from memory; where something is unverified, incomplete,
or deferred, that's called out explicitly.

This document is meant for someone (human or AI) joining the project
or being asked for advice. Accuracy over polish.

---

## 1. Product overview

**What it is.** A React Native / Expo app that takes a photo of a real
person and re-renders it under a chosen "transformation" via Google's
Gemini image-edit model ("Nano Banana"). The user drops in a photo,
picks a category (race, age, gender, military uniform, celebrity
mashup, etc.), waits ~10–15 seconds per variant, and gets back one or
more edited images. Results are saved to a gallery, comparable
before/after via a slider, and shareable with an optional watermark.

**Who it's for.** Consumer C-end users — entertainment use case. Same
audience as FaceApp / Lensa, narrower feature scope. The branding
("see yourself across the multiverse") leans into curiosity rather
than self-improvement or aging gimmicks.

**Core user flow** (the happy path):
1. Sign in (email/password, or Apple on iOS).
2. Drop a photo on the home screen. App auto-runs people-detection
   (Gemini 2.5 Flash vision) to identify each person + their bbox +
   a minor-flag.
3. If multiple people are detected, optionally narrow the selection
   to a subset.
4. Pick a category, then pick one or more sub-variants and any
   opt-in styling accessories (e.g. "South Asian" + "bindi").
5. Tap Generate. Server opens an NDJSON stream; each variant arrives
   one tile at a time on the results screen.
6. Tap a tile → the result-detail screen with a Before/After slider,
   five tinted filter chips, optional watermark, Save + Share.

**Monetization.** Hybrid quota + IAP:
- **Free tier:** 3 lifetime generations (`config.freeGenerationCap`).
  Counter lives in the user doc; incremented server-side on each
  successful generation by the Cloud Function, mirrored client-side
  in local-dev.
- **Pro tier:** unlimited generations + access to the
  `ethnicity-blend` premium category + no watermark. Sold via
  RevenueCat on iOS/Android (no web purchase path). Plans defined
  as weekly / monthly / yearly — actual offerings + prices are
  configured on the RevenueCat dashboard, not in code.
- **Web users** can read `subscriptionStatus` from their user doc
  (RevenueCat webhook flips it server-side after a native purchase)
  but cannot purchase on web. The PaywallModal explicitly rejects
  `purchase()` on web.

---

## 2. Tech stack

Versions are from `package.json` and `functions/package.json`.

**Mobile framework**
- Expo SDK 54.0
- React Native 0.81.5 (the New Architecture is on by default in SDK 54)
- React 19.1, React DOM 19.1
- React Native Web 0.21 (web target via metro bundler)
- TypeScript 5.9, strict mode

**Routing**
- expo-router 6.0 (file-based, typed routes experiment enabled)
- Web bundler set to `metro`, output `server` (Expo Router server routes
  for the local dev API)

**State management**
- Zustand 4.5
  - `useAuthStore` — Firebase user, user doc, loading/error
  - `useGenerationStore` — selected photo, detection result, streaming
    slots, local gallery
  - `useSubscriptionStore` — Pro status, plan, expiry

**Auth**
- Firebase Auth (firebase 10.12)
- Email/password on all platforms
- Sign in with Apple via expo-apple-authentication (iOS-only native;
  web has a popup path but isn't wired into the login UI)
- Native Google reauth NOT wired (web popup only; needs
  `@react-native-google-signin` in a dev build)

**Database & storage**
- Firestore (firebase/firestore)
- Firebase Cloud Storage (firebase/storage)
- AsyncStorage (`@react-native-async-storage/async-storage` 2.2)
  — used for auth persistence + the local-dev gallery + onboarding flags

**Cloud Functions**
- Firebase Functions Gen 1
- Node 22
- firebase-functions ^5.0, firebase-admin ^12.0
- `@google/generative-ai` ^0.21
- Built via `tsc`, deployed via `firebase deploy --only functions`

**AI**
- Gemini 2.5 Flash Image (codename "Nano Banana") — the image-edit
  model. Default: `gemini-2.5-flash-image`. Override:
  `GEMINI_IMAGE_MODEL`.
- Gemini 2.5 Flash — the vision model used for people-detection AND
  the composer step that writes per-person edit prompts. Default:
  `gemini-2.5-flash`. Override: `GEMINI_VISION_MODEL` /
  `GEMINI_COMPOSER_MODEL`.
- Pipeline: client → Expo Router route or Cloud Function → composer
  step → image-edit step → upload to Storage → Firestore write.

**Payments**
- react-native-purchases 8.0 (RevenueCat SDK)
- Native iOS + Android only; web no-ops

**Image handling**
- expo-image-picker 17.0 (gallery + camera)
- expo-image-manipulator 14.0 (client-side resize to 1024px @ 0.8
  JPEG quality, plus 256px thumbnails)
- expo-file-system 19.0 (new class API: `File`, `Paths`)
- react-native-view-shot 4.0 (captures the filtered/watermarked
  result View for save/share)
- expo-sharing 14.0 (system share sheet on native)

**Motion + UI**
- react-native-reanimated ~4.1 + react-native-worklets 0.5
- react-native-gesture-handler ~2.28
- react-native-svg 15.12
- lucide-react-native ^1.16 (icon language)
- react-native-safe-area-context ~5.6
- react-native-screens ~4.16

**Observability**
- @sentry/react-native ~7.2 (client errors; opt-in via
  `EXPO_PUBLIC_SENTRY_DSN`)
- Firestore `logs/` collection (per-variant server telemetry)
- Firestore `moderation_log/` collection (audit trail)
- `console.log` with `[fn/...]` / `[gemini]` / `[telemetry]` prefixes
  for grep

**Push notifications**
- expo-notifications 0.32
- expo-device 8.0 (real-device check)
- Server-side: Firestore trigger → Expo Push API
  (`https://exp.host/--/api/v2/push/send`)
- Native only; web no-ops; simulators skip

**Misc**
- jszip ^3.10 (account data export)
- framer-motion ^12.40 (listed in `package.json` but no usage found
  in the source tree — likely a stray dep from an early prototype;
  candidate for `npm uninstall`)
- expo-haptics 15.0 (Button medium-impact on press, native only)
- expo-constants 18.0 (EAS projectId, app version)
- expo-font 14.0 (currently used only via web font preconnect in
  `app/+html.tsx`)

**Testing**
- Jest 30 + ts-jest 29 (NOT jest-expo — deliberately scoped to
  testing the prompt catalog, no RN/React rendering)
- 19 tests, 7 snapshot files, all passing as of last verification

---

## 3. Architecture

### App shell

```
app/
  _layout.tsx         RootLayout — Sentry init, ErrorBoundary,
                      ToastProvider, AuthGate, Stack of all screens.
  +html.tsx           Web-only HTML shell with FRAME CSS variables,
                      Inter + JetBrains Mono fonts, dark scrollbar,
                      cursor:pointer + focus-visible rules, and the
                      prefers-reduced-motion media query.
  index.tsx           Splash route — branded wordmark + LoadingSpinner.
                      AuthGate redirects to /(auth)/login or /(tabs)/home.
  (auth)/             Auth-only screens (login, signup).
  (tabs)/             Authenticated screens (home, gallery, profile).
  generate/           [categoryId] picker + results stream.
  result/[id].tsx     Result detail (slider + filters + share).
  api/                Expo Router server routes — LOCAL DEV ONLY:
    generate+api.ts   Mirror of functions/src/generate.ts.
    detect+api.ts     Mirror of functions/src/detect.ts.
  privacy.tsx         First-pass privacy policy (placeholder emails).
  terms.tsx           First-pass ToS (placeholder emails).
  dev/prompt-eval.tsx Dev-only prompt-matrix testing screen.
```

### Auth gate

`app/_layout.tsx` wraps the Stack in `<AuthGate>`. AuthGate:
1. Subscribes to `onAuthStateChanged` via `lib/auth.ts subscribeToAuth`.
2. Mirrors the user into `useAuthStore`, and the user doc from
   Firestore via `ensureUserDoc`.
3. Has a 5s fallback timer — if the auth listener never fires
   (bridge stall, init failure), it flips loading=false and routes
   to login so the screen doesn't hang on a blank.
4. Routes:
   - `!user && !inAuth` → replace to `/(auth)/login`
   - `user && inAuth` → replace to `/(tabs)/home`
5. Initializes push tokens (native only, real device only) and
   registers the notification-tap deep-link handler.
6. Mirrors `subscriptionStatus` from the user doc into the
   subscription store so Pro web users see correct UI even though
   RevenueCat is native-only.

### Data flow — photo → result

Five distinct stages. Same shape in local-dev and production; only
the endpoints differ.

```
1. Photo pick
   useImagePicker.ts → expo-image-picker → expo-image-manipulator
                       (resize to 1024px, JPEG q=0.8, base64)
                     → PickedImage { uri, base64, width, height }

2. People detection
   home.tsx picks photo → setPhoto(uri, base64)
                        → runDetection(photo)
                            ↓
                         detectionCache.ts (FNV-1a hash check)
                            ↓ (miss)
                         lib/detect.ts requestDetection(base64)
                            ↓
                         POST /api/detect (local) OR
                         POST {CLOUD_FUNCTIONS_URL}/detect
                            ↓
                         Gemini 2.5 Flash + DETECTION_PROMPT
                            ↓
                         { people: [...], safety: {...} }
                            ↓
                         normalizePeople / normalizeSafety
                            ↓
                         generationStore.setDetectedPeople(people)
                         generationStore.setSafetyVerdict(verdict)

3. Category + variant selection
   home.tsx → handleSelect(category) gates on:
              - safety verdict (blocked → refuse; flagged → confirm)
              - multi-person selection
              - minor-block on premium categories (CLIENT-SIDE; see §9)
              - paywall for non-Pro on premium
              - consent modal (premium, once per session)
              → router.push(/generate/{categoryId})
   generate/[categoryId].tsx → user picks subcategoryIds + accessories
                              → useGeneration.start({...})

4. Generation
   useGeneration.start → buildInitialSlots → initSlots (UI shows
                          skeletons)
                       → streamGeneration(req, onEvent)
                            ↓
                         POST /api/generate (local) OR
                         POST {CLOUD_FUNCTIONS_URL}/generate
                            ↓
                         For each subcategoryId, the server picks one
                         of three pipelines based on people count +
                         selection:
                           (A) solo: static prompt
                           (B) multi-person, 0-1 selected: composer
                               (Gemini 2.5 Flash writes a per-person
                               prompt) → Nano Banana, one pass
                           (C) multi-person, 2+ selected: SEQUENTIAL
                               per-person composer + Nano Banana
                               passes. Avoids the "model drops the
                               harder subject" failure mode in one-
                               shot multi-person edits.
                            ↓
                         Each variant emits an NDJSON event
                         ({start, result, error, done, fatal}) which
                         the client renders as the result tile
                         transitions pending → complete | failed.

5. Persistence + display
   On stream close:
     - Cloud Function path: server already uploaded images to
       Storage + wrote the Firestore generation doc with https
       URLs. Client just navigates to /generate/results.
     - Local dev path: client calls persistLocalGeneration() which
       uploads original + each result (+ 256px thumbs) to Storage
       and writes the Firestore doc. THIS REQUIRES BEING SIGNED IN
       AND HAVING ACTIVE FIREBASE STORAGE WRITES, but firestore.rules
       denies generations.create from clients (server-only). See §9
       for the inconsistency.
     - Either path: also appends to the AsyncStorage-backed local
       gallery via generationStore.appendLocalGeneration. The
       gallery tab merges Firestore + local + dedupes by id.
```

### Local-dev vs Cloud Function path

The single toggle is `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL`. Set → all
client calls route to the deployed functions (`{URL}/generate`,
`{URL}/detect`). Unset → client hits the Expo Router server routes
at `/api/generate` and `/api/detect` running inside the Metro dev
server.

The local routes deliberately skip:
- Firebase Admin ID-token verification (no auth header check)
- Firestore quota + rate-limit enforcement
- Cloud Storage upload (results come back as inline `data:` URIs)
- Firestore moderation_log + logs writes (`[telemetry]` stdout
  instead)

Both routes share the same prompt catalog (`lib/prompts.ts` vs
`functions/src/prompts.ts` — kept in sync by convention, snapshot
tests catch drift on the lib side), the same `composePrompt.ts`
module (the lib version is imported by the Expo Router route, the
functions version is a copy), and produce identical NDJSON event
shapes.

The Cloud Functions code IS present but NOT DEPLOYED (per
`CLAUDE.md`'s parked todos and the live state of `whatif-98256`).
The app is currently development-mode against the local routes.

---

## 4. File-by-file breakdown

Significant files only — `node_modules`, lock files, generated
TypeScript build output, and tooling configs are excluded.

### Root config

- `app.json` — Expo config. Bundle ID `com.whatif.app`, EAS project
  ID, dark `userInterfaceStyle`, platforms (ios/android/web),
  permission strings, plugin list (expo-router,
  expo-apple-authentication, expo-image-picker, @sentry/react-native).
  Owner: `olytoma`.
- `package.json` — All client deps + scripts (`start`, `ios`,
  `android`, `web`, `typecheck`, `test`, `test:update`).
- `tsconfig.json` — Strict, path alias `@/*` → root.
- `babel.config.js` — Babel preset (`babel-preset-expo`).
- `metro.config.js` — Metro bundler config; enables package exports
  with the `react-native` condition name (required so Firebase Auth
  resolves the RN persistence build instead of the browser build).
- `jest.config.js` — ts-jest preset, node env, matches only
  `__tests__/**/*.test.ts`. Mirrors the `@/` alias.
- `firebase.json` — Wires `firestore.rules`, `firestore.indexes.json`,
  `storage.rules`, and the `functions/` codebase.
- `firestore.rules` — Owner-only Firestore rules. See §5 for shape.
- `firestore.indexes.json` — One composite index for
  `generations where userId == ? order by createdAt desc`.
- `storage.rules` — Owner-only reads on `users/{uid}/**`; ALL
  client writes denied (Cloud Function Admin SDK bypasses).
- `expo-env.d.ts` — Expo-generated env types.
- `CLAUDE.md` — Project context for Claude Code sessions (this file
  was the starting point for understanding the project).
- `README.md` — Short top-level readme (less detailed than this doc).
- `frame-design-system.md` — Notes on the FRAME visual system used
  for the UI elevation pass.
- `UI_ELEVATION_STATUS.md` — Working doc from a recent multi-session
  UI overhaul pass. Reads like a changelog.

### `app/` — Screens and server routes

**Root / chrome**

- `_layout.tsx` — RootLayout. Most complex file in `app/`. Wraps
  the Stack in Sentry ErrorBoundary, ToastProvider, AuthGate.
  AuthGate has the 5s fallback timer, push token registration,
  notification deep-link handler, and the redirect logic. Renders
  the branded splash + spinner while auth is loading. ConfigError
  fallback when Firebase env vars are missing.
- `index.tsx` — Splash route. Brand wordmark + LoadingSpinner.
- `+html.tsx` — Web HTML shell. Inline FRAME CSS variables + font
  preconnect + dark scrollbar + `cursor: pointer` for Pressables
  on web + `:focus-visible` keyboard ring +
  `prefers-reduced-motion` media query.

**Auth**

- `(auth)/_layout.tsx` — Auth Stack wrapper.
- `(auth)/login.tsx` — Email/password sign-in + Apple Sign In
  button (iOS only). On viewports ≥768px shows the
  `<FeatureCarousel>` marketing hero above the form; below that
  width it shows the compact wordmark header.
- `(auth)/signup.tsx` — Same shape; password 8-char minimum.

**Tabs**

- `(tabs)/_layout.tsx` — Tab navigator with lucide Home / Images /
  User icons + FRAME-styled tab bar.
- `(tabs)/home.tsx` — Most complex screen. Photo upload, detection
  status pill, multi-person selector, category grid, all the gates
  (safety, minor-block, paywall, consent), the navigation to
  `/generate/{categoryId}`.
- `(tabs)/gallery.tsx` — Gallery tab. FlatList virtualized 3-up grid
  merging Firestore + local-AsyncStorage entries deduped by id.
  Filter chips per category, Results/Compare mode switch
  (Compare draws a split tile of original vs result). Long-press
  → delete with platform-branched confirm.
- `(tabs)/profile.tsx` — Identity card, FREE/PRO plan card,
  settings rows (privacy, terms, export data, delete account),
  logout. Long-pressing the version label opens
  `/dev/prompt-eval` in `__DEV__`.

**Generation flow**

- `generate/[categoryId].tsx` — Subcategory picker. Variation
  chips with check-glyph selected state, optional accessory chips
  per selected variant.
- `generate/results.tsx` — Streaming results screen. Renders
  `ResultsGrid` from `generationSlots`, smooth time-based progress
  bar with snap-to-truth on real events, total-failure recovery
  banner, three exit-path actions (Generate More / New Photo /
  Done).
- `result/[id].tsx` — Result detail. Hero caption with eyebrow +
  headline + meta row, glow frame around the BeforeAfterSlider,
  variant nav strip (Prev / counter / Next) when more than one
  variant, FilteredResultPanel below.

**Server routes (local-dev only)**

- `api/generate+api.ts` — Expo Router server route, full mirror
  of the Cloud Function. NDJSON streaming, the same three-pipeline
  branching logic (solo / composer / sequential), the same retry
  policy.
- `api/detect+api.ts` — Mirror of `functions/src/detect.ts`. Same
  DETECTION_PROMPT, same response normalization.

**Misc**

- `privacy.tsx`, `terms.tsx` — First-pass policy text. Both
  contain inline `privacy@whatif.app` / `support@whatif.app`
  placeholder emails with a "replace with your real address" note
  baked into the visible text. Back arrow is still Unicode `←`
  (TODO: swap to lucide `<ArrowLeft />` — was missed in the icon
  sweep).
- `dev/prompt-eval.tsx` — Dev-only prompt matrix harness. Pick a
  photo on home, navigate here, tick which (category, sub) pairs
  to run, hit Run and see all the results in a grid. Hidden in
  production builds via `__DEV__`. SkeletonTile fills pending
  cells.

### `components/` — Top-level (feature) components

- `BeforeAfterSlider.tsx` — Result-screen slider. 48px white
  handle with chevron pair, scale-on-drag spring, violet divider
  line, BEFORE/AFTER label pills. Pan gesture attached to the
  full container (not the handle).
- `CategoryCard.tsx` — Home grid card. CategoryIcon in a
  GlyphTile, ProBadge corner tag when locked. Uses
  `useCardEntrance` + `usePressScale` from `hooks/useMotion.ts`.
- `CategoryGrid.tsx` — Two-column grid wrapper for CategoryCard.
- `CategoryIcon.tsx` — Maps category id → lucide icon (Globe,
  ArrowLeftRight, Hourglass, ShieldHalf, Landmark, Star, Dna).
- `ConsentModal.tsx` — Per-session premium-category consent gate.
  Three bullet points + a checkbox. Hard minor-block lives
  upstream in home.tsx and never opens this modal.
- `DeleteAccountModal.tsx` — Type-your-email confirmation
  destructive flow. Works identically on web + native.
- `FilteredResultPanel.tsx` — Result detail's filter row + Save +
  Share. Five tinted-overlay filters (Original / B&W / Sepia /
  Cool / Warm), capture-driven export via react-native-view-shot.
  Watermark pill (Sparkles glyph + "What If") rendered inside the
  capture target.
- `GenerationCounter.tsx` — Top-bar quota pill. ProBadge for Pro,
  "1/3 FREE" pill otherwise.
- `HomeOnboardingCard.tsx` — One-time welcome card on home. Sparkles
  GlyphTile + dismiss × button. AsyncStorage-persisted dismiss flag.
- `OnboardingTutorial.tsx` — 3-step modal walkthrough on first
  signed-in launch. Upload / Sparkles / Wand2 lucide icons in a
  large GlyphTile per step.
- `PeopleSelector.tsx` — Numbered circular markers over the photo,
  one per detected person. Dim overlay on unselected. Select all /
  none controls.
- `PhotoUploader.tsx` — Drop zone. Empty state with Upload
  GlyphTile + format badges + native camera pill. Filled state
  with image + Change / Take Photo / Remove actions.
- `ReauthModal.tsx` — Inline reauth flow for sensitive operations
  (currently only account deletion). Branches on the user's
  primary auth provider (password / google.com / apple.com /
  other). Google + Apple are web-popup only — on native it
  shows the "log out and back in" fallback message.
- `ResultCard.tsx` — Individual result tile. SkeletonTile pending
  state, complete-status Image, failed-status error overlay.
  Spring press + entrance animation via the shared hooks.
- `ResultsGrid.tsx` — 2-column grid of ResultCard, accepts either
  the streaming-slot shape or a finished-results array.

### `components/ui/` — Primitives

- `Button.tsx` — FRAME button. primary/secondary/ghost variants,
  uppercase tracking on primary, spring press via
  `usePressScale`, haptic-impact on press (native).
- `Card.tsx` — Surface-800 + border + xl radius wrapper. Used by
  the profile screen.
- `FeatureCarousel.tsx` — 3D-fan marketing carousel hero (RN port
  of a shadcn/Tailwind reference). Used on login screen for
  viewports ≥768px. Reanimated `useAnimatedStyle` over a single
  `progress` shared value; shortest-path wrap; respects
  prefers-reduced-motion (skips autoplay + skips tween).
- `GlyphTile.tsx` — Accent-tinted square tile for hosting lucide
  icons. Used in CategoryCard, HomeOnboardingCard, PhotoUploader,
  gallery empty state, OnboardingTutorial.
- `LoadingSpinner.tsx` — FRAME ring spinner with rotating
  flavor-text taglines ("Rewriting your DNA…",
  "Consulting the multiverse…", …). Used for splash + auth
  loading + pre-stream busy state.
- `PaywallModal.tsx` — Bottom-sheet paywall. Feature checklist,
  RevenueCat package selector, Subscribe + Restore buttons. Pulls
  offerings from `useSubscription`.
- `ProBadge.tsx` — "PRO" + Sparkles pill in three sizes (sm/md/lg).
- `PulseIndicators.tsx` — Two branded indeterminate indicators:
  - `<ScanLine />` — inline horizontal sweeping segment for status
    pills (e.g. "Detecting people…")
  - `<SkeletonTile />` — full-rect pulsing placeholder for tile
    loading states (ResultCard pending, prompt-eval pending)
- `Toast.tsx` — Context-provider toast system. info / error /
  success kinds, FadeInUp / FadeOutUp via Reanimated.

### `lib/` — Pure modules (no React)

- `auth.ts` — All Firebase Auth wrappers. Email/password, Apple
  ID token, Google ID token, sign out. `deleteAccount()`
  orchestrator (Firestore wipe → user doc delete →
  AsyncStorage clear → Auth delete, in order). `ReauthRequiredError`
  + the four reauth helpers. `friendlyAuthErrorMessage` — error
  code → user-facing string (collapses `user-not-found` into the
  same message as `wrong-password` to block enumeration).
- `composePrompt.ts` — The meta-prompt step. Two variants (v1
  default = unified plural; v2 = enumerated per-person). v1 won on
  5-person race-swap benchmarks. Retries 429/5xx with bounded
  backoff. Throws on non-retryable → caller falls back to static
  scoping.
- `detect.ts` — Client wrapper for the detect endpoint. Attaches
  Firebase Bearer token in production, skips it in local-dev.
  Exports the `DetectedPerson` + `SafetyVerdict` types used
  throughout the app. NOT the server-side detection logic — that
  lives in `lib/serverDetection.ts` (local dev) and
  `functions/src/detect.ts` (production).
- `detectionCache.ts` — In-memory LRU (cap 10) keyed by FNV-1a
  hash of the base64 image. Avoids redundant Gemini detect calls
  when the user re-picks the same photo within a session.
- `exportData.ts` — Account-data export (Profile "Download my
  data"). Builds a zip in-memory via JSZip: `user.json`,
  `README.txt`, `generations/{id}/{metadata.json,original.jpg,result_N.jpg}`.
  Web: blob URL + anchor download. Native: write to cache dir +
  open expo-sharing share sheet.
- `firebase.ts` — Initializes the FirebaseApp + Auth + Firestore +
  Storage. Branches on `Platform.OS === 'web'` for RN persistence
  (uses `getReactNativePersistence(AsyncStorage)` on native).
  Resilient to fast-refresh re-imports via the
  `auth/already-initialized` catch.
- `firestore.ts` — Typed Firestore wrappers and the canonical
  `UserDoc` / `GenerationDoc` / `GenerationResult` interfaces.
  `ensureUserDoc`, `listGenerations` (the
  userId+createdAt-indexed query), `deleteGeneration`,
  `deleteAllUserGenerations` (used by account-delete),
  `deleteUserDoc`, `incrementFreeGenerations`. NO writes to
  `generations` — those are server-only.
- `gemini.ts` — Client stream consumer + the local-dev
  persistence path. `streamGeneration` opens the NDJSON stream
  and parses line-by-line. `requestGeneration` is a backward-compat
  non-streaming wrapper. `persistLocalGeneration` is the local-dev
  upload + Firestore-write path. `QuotaExceededError` for 402
  paywall signaling.
- `localGallery.ts` — AsyncStorage-backed gallery. Stores
  generation entries with `_localCreatedAt` epoch. Cap 30
  entries, oldest evicted. Used for dev (where local-dev API
  bypasses Firestore) + as a resilient fallback in production.
  `appendLocalGeneration`, `removeLocalGeneration`,
  `listLocalGallery`, `getLocalGeneration`.
- `notifications.ts` — Push token registration + listener wiring.
  Web no-ops. Simulators skip. Writes `expoPushToken` to the user
  doc; consumed by `functions/src/notifyOnComplete.ts`.
- `prompts.ts` — The prompt catalog. All categories × all
  subcategories × their accessory lists. `getPrompt`,
  `appendAccessoryPrompt`, `buildScopedPrompt` (the three-case
  scoping logic for solo / all / subset), `isPremiumCategory`.
  Snapshot-tested.
- `revenuecat.ts` — Thin RevenueCat wrappers. `RC_AVAILABLE` guard
  makes every method a no-op on web. `initRevenueCat`,
  `getOfferings`, `purchasePackage`, `restorePurchases`,
  `getCustomerInfo`, `isEntitledPro`.
- `serverDetection.ts` — **Server-only.** Shared people-detection
  module added in the safety-hardening pass. Owns the
  `DETECTION_PROMPT`, the Gemini call + retry, and the
  normalize/parse helpers. Exports `runPeopleDetection(base64)` so
  both `app/api/detect+api.ts` (HTTP-exposed) and
  `app/api/generate+api.ts` (internal minor-gate) can call detection
  through one entry point — no internal HTTP hop, no prompt
  duplication. Also exports `checkLocalRateLimit` (in-memory
  sliding-window limiter — local-dev runaway-script guard;
  production Cloud Function uses the Firestore limiter in
  `functions/src/detect.ts`). NOT imported from any client code; the
  Metro bundler tree-shakes it out of the client bundle. Production
  mirror of the same logic lives in `functions/src/detect.ts`'s
  exported `runPeopleDetection` (kept in sync by convention; the
  detection prompt is the same text in both).
- `sentry.ts` — Init guarded by DSN AND wrapped in try/catch
  (observability must never break the app). `tracesSampleRate: 0`
  (errors only). Disabled in `__DEV__`. Only attaches uid to
  events; never email/displayName.
- `storage.ts` — Storage path helpers + `uploadImage` +
  `resizeToThumbnail` (256px JPEG via expo-image-manipulator).

### `hooks/`

- `useAuth.ts` — Subscribes to the Firebase auth listener,
  syncs into `useAuthStore`. Calls `ensureUserDoc` on sign-in;
  mirrors subscription status from the user doc.
- `useGeneration.ts` — The orchestrator hook. `start({...})` is the
  one public entry point: gates on quota, builds the slot list,
  reads detection state at call time, opens the stream, drives
  slot updates per event, runs `persistLocalGeneration` in dev,
  appends to the local gallery. Returns `start`, `canGenerate`,
  `remaining`, `isPro`.
- `useImagePicker.ts` — `pick()` (gallery) and `capture()` (camera)
  return the same `PickedImage` shape. Both feed through a shared
  `processAsset` pipeline: resize to 1024px, JPEG q=0.8, base64.
  Has a three-way base64 fallback chain (manipulator → native
  File API → web FileReader).
- `useMotion.ts` — `usePressScale` + `useCardEntrance`. Shared
  motion primitives consumed by CategoryCard, ResultCard, Button.
- `useSubscription.ts` — RevenueCat init + customer info listener
  on native. Web no-ops (Pro status mirrored from the user doc
  instead). Exports `offerings`, `purchase`, `restore`, plus the
  store state.

### `stores/`

- `authStore.ts` — `{ user, userDoc, loading, error }` Zustand
  store with setters.
- `generationStore.ts` — Big one. Selected photo, detection
  result, person-selection state, current category, streaming
  slots, local gallery slice. Owns the slot lifecycle
  (`initSlots`, `resolveSlot`, `failSlot`, `finishStream`,
  `clearSlots`) and the local gallery actions
  (`hydrateLocalGallery`, `appendLocalGeneration`,
  `removeGeneration`).
- `subscriptionStore.ts` — `{ plan, isActive, expiresAt, loading }`.

### `constants/`

- `categories.ts` — UI catalog of categories (label, description,
  isPremium). NO prompt text — that's in `lib/prompts.ts`. Each
  category lists its subcategories with `id` + `label` +
  `promptTemplate` (the promptTemplate field on Subcategory is
  unused by the runtime — kept around as historical
  documentation; `lib/prompts.ts` is the source of truth for
  prompts).
- `config.ts` — Env-var loaders (`config.firebase`,
  `config.revenueCat`, `config.cloudFunctions.baseURL`,
  `config.sentry.dsn`). `freeGenerationCap: 3`. `maxImageSize: 1024`.
  `imageQuality: 0.8`. `assertFirebaseConfigured()` throws on
  missing keys.
- `theme.ts` — FRAME design tokens. Colors (4-stop dark surface
  ramp + violet accent), font families (Inter + JetBrains Mono),
  typography scale, spacing scale (4/8/12/16/24/32/48), radii
  (sm 6 / md 8 / xl 12 / xxl 16 / pill 999), three shadow
  presets (glow / card / elevated). Single source of truth.

### `functions/src/` — Cloud Functions (NOT DEPLOYED)

- `index.ts` — Admin SDK init + re-exports.
- `generate.ts` — Most complex file in the project. Cloud Function
  mirror of `app/api/generate+api.ts` with the production-only
  surface added: `verifyAuth` (Bearer token decode),
  `checkRateLimit` (10/min via Firestore transaction on
  `rateLimits/{uid}`), `checkQuotaAndCategory`, plus the
  server-side minor-detection gate (calls `runPeopleDetection` from
  `./detect` for sensitive categories and refuses with 403 if any
  person appears under 18; fail-closed on detection errors → 503).
  Streams NDJSON. Uploads to Storage via Admin SDK. Writes Firestore
  generation doc + per-variant `logs/` entries + moderation_log
  entry. Increments `freeGenerationsUsed` post-success for non-Pro
  users. Same three-pipeline branching as the local route.
- `detect.ts` — Production detection endpoint. Exports two things:
  the `detect` HTTP cloud function (auth + size + rate-limit + call
  to `runPeopleDetection`) AND the `runPeopleDetection(base64)`
  function itself, which `generate.ts` calls directly for the minor
  gate. Now has its own Firestore-transaction rate limiter
  (`checkDetectRateLimit`, keyed `rateLimits/detect:{uid}` so it has
  independent budget from `generate`'s 10/min limiter; ceiling 20/min).
- `composePrompt.ts` — Copy of `lib/composePrompt.ts`.
- `prompts.ts` — Copy of `lib/prompts.ts`. Drift is caught only
  manually; the snapshot tests cover the lib copy.
- `webhooks.ts` — `revenuecatWebhook` HTTP handler. Fail-closed
  on missing `REVENUECAT_WEBHOOK_SECRET`. Maps RC event types
  (INITIAL_PURCHASE / RENEWAL / etc. → subscriptionStatus 'pro';
  CANCELLATION / EXPIRATION / BILLING_ISSUE → 'free'). Writes
  both `users/{uid}` and `subscriptions/{uid}`.
- `storageCleanup.ts` — Two Firestore triggers:
  `onGenerationDeleted` (sweeps
  `users/{uid}/generations/{id}/` prefix) and `onUserDeleted`
  (sweeps `users/{uid}/`). Best-effort, logs errors, never throws.
- `notifyOnComplete.ts` — Firestore trigger on
  `generations/{id}` update. Fires on `processing → complete`
  and `processing → failed`. Reads `users/{uid}.expoPushToken`,
  POSTs to the Expo Push API with a result-count-aware body
  and `data: { generationId, route: '/result/{id}?idx=0' }`.

### `__tests__/`

- `prompts.test.ts` — 19 tests across the prompt catalog,
  accessory snippets, scoping logic. 7 snapshot files
  (`__snapshots__/prompts.test.ts.snap`). Purely the prompt
  surface — no UI tests, no hook tests.

---

## 5. Database schema

### Firestore collections

`users/{uid}` — readable + writable by owner. Updates cannot
modify `subscriptionStatus` or `freeGenerationsUsed` from the
client (rules enforce; only Cloud Function Admin SDK can).

```
uid                          string
email                        string | null
displayName                  string | null
photoURL                     string | null
freeGenerationsUsed          number
subscriptionStatus           'free' | 'pro'
subscriptionExpiry           Timestamp | null
revenueCatId                 string | null
expoPushToken                string?           — written by client at signin
expoPushTokenPlatform        'ios' | 'android'?
expoPushTokenUpdatedAt       Timestamp?
createdAt                    Timestamp | null
updatedAt                    Timestamp | null
```

`generations/{id}` — readable + deletable by owner. CREATE +
UPDATE are server-only (Admin SDK bypass). One composite index:
`(userId asc, createdAt desc)`.

```
id                           string
userId                       string
categoryId                   string            — e.g. 'race-swap'
categoryLabel                string            — duplicated; future cleanup
originalImageURL             string            — Storage download URL
originalThumbURL             string?           — 256px thumbnail; local-dev only today
results                      GenerationResult[]
status                       'pending' | 'processing' | 'complete' | 'failed'
createdAt                    Timestamp | null

# GenerationResult shape:
imageURL                     string
thumbURL                     string?
prompt                       string            — the base subcategory prompt
label                        string            — e.g. 'East Asian'
```

`subscriptions/{uid}` — read-only for owners. Written exclusively
by the RevenueCat webhook.

```
userId                       string
plan                         'weekly' | 'monthly' | 'yearly'
isActive                     boolean
expiresAt                    Timestamp | null
revenueCatCustomerId         string
lastWebhookEvent             string
updatedAt                    Timestamp
```

`rateLimits/{uid}` — server-only. Sliding 60s window for the
generate Cloud Function (10 generations/min ceiling).

```
windowStart                  number (ms epoch)
count                        number
```

`logs/{id}` — server-only. Per-variant generation telemetry.
Append-only.

```
generationId                 string
userId                       string
categoryId                   string
subcategoryId                string
status                       'complete' | 'failed'
errorMessage                 string | null
durationMs                   number
promptSource                 'composed' | 'composed-fallback' | 'static' | 'sequential' | null
attempts                     number
modelId                      string
source                       'cloud-function'  — distinguishes from local-dev (where logs aren't written)
timestamp                    Timestamp
```

`moderation_log/{id}` — server-only. Audit trail for the generate
endpoint. No photos, no prompt text — just decision inputs that
could reconstruct a specific request for takedown review. Two row
shapes share the collection, distinguished by `outcome`:

```
uid                          string
generationId                 string | undefined  — only present when outcome === 'proceeding';
                                                   refused-gate rows fire BEFORE the generationId
                                                   is created
categoryId                   string
subcategoryIds               string[]
totalPeopleInImage           number | null      — client-reported headcount
selectedPeopleCount          number | null      — # of people the user chose to transform
containsMinor                boolean | null     — client-supplied HINT only (untrusted)
serverDetectedMinor          boolean | null     — server's re-detection truth; only populated
                                                   when the minor gate ran (i.e. category was
                                                   minor-sensitive). null = gate did not run.
serverDetectedPeopleCount    number | null      — # of people the server's detect call saw,
                                                   for cross-checking against the client count
outcome                      'refused-minor-gate' | 'proceeding'
source                       'cloud-function'
timestamp                    Timestamp
```

Local-dev (`app/api/generate+api.ts`) writes the equivalent shape
to stdout as `[api/generate] moderation_log <JSON>` instead of
Firestore — same field names so a tailing dev can grep them.

### Cloud Storage paths

All under `users/{uid}/`. Rule: read-only for owner, ALL writes
denied (Admin SDK only).

```
users/{uid}/generations/{id}/original.jpg
users/{uid}/generations/{id}/original_thumb.jpg     — 256px; local-dev only today
users/{uid}/generations/{id}/result_0.jpg
users/{uid}/generations/{id}/result_0_thumb.jpg     — 256px; local-dev only today
users/{uid}/generations/{id}/result_1.jpg
...
```

Result URLs are signed with a 365-day expiry by the Cloud
Function (flagged as a MEDIUM security finding — see §9).

---

## 6. Transformation categories

Five categories total after the pre-launch safety pass. Free tier
covers the first four; only `ethnicity-blend` is Pro-only.

Two categories were removed in commit `2a9050d`:
- `political-mashup` (Trump's Kid / Obama's Kid / Biden's Spouse /
  AOC's Sibling)
- `celebrity-mashup` (Beyoncé's Child / Drake's Sibling /
  Kardashian Family / Zendaya's Twin)

Re-mixing a named real person's likeness is a liability and
reputation risk we're not carrying at launch. `ethnicity-blend`
remains as the only premium category because it mixes generalized
heritage traits rather than a specific named individual's face.

**`race-swap`** (free) — 6 subs. Each prompt has a three-part
structure (specific heritage anchors, "shift away from X/Y/Z"
list to avoid under-editing, recognizability gate). Most have
opt-in accessories.

| sub                 | label              | accessories                  |
|---------------------|--------------------|------------------------------|
| `east-asian`        | East Asian         | conical-hat                  |
| `south-asian`       | South Asian        | turban-sikh, bindi           |
| `black`             | Black              | durag, headwrap              |
| `white-european`    | White/European     | cowboy-hat, beanie, newsboy-cap, yamaka |
| `latino`            | Latino             | sombrero, charro-hat         |
| `middle-eastern`    | Middle Eastern     | hijab, keffiyeh              |

**`gender-swap`** (free) — 3 subs: `male`, `female`,
`androgynous`. No accessories.

**`age-transform`** (free) — 6 subs:

| sub             | label             | accessories                |
|-----------------|-------------------|----------------------------|
| `baby`          | Baby (1yr)        | pacifier                   |
| `child`         | Child (8yr)       | —                          |
| `teen`          | Teen (16yr)       | —                          |
| `young-adult`   | Young Adult (25yr)| —                          |
| `middle-aged`   | Middle Aged (50yr)| reading-glasses            |
| `elderly`       | Elderly (80yr)    | reading-glasses, cane      |

**`military-forces`** (free) — 14 subs. No accessories.

| sub                       | label                    |
|---------------------------|--------------------------|
| `us-military`             | US Military              |
| `us-police`               | US Police                |
| `british-military`        | British Military         |
| `british-police`          | British Police / Bobby   |
| `chinese-pla`             | Chinese PLA              |
| `japanese-jsdf`           | Japanese JSDF            |
| `japanese-samurai`        | Japanese Samurai         |
| `russian-military`        | Russian Military         |
| `soviet-military`         | Soviet Red Army          |
| `french-foreign-legion`   | French Foreign Legion    |
| `german-bundeswehr`       | German Bundeswehr        |
| `korean-military`         | South Korean Military    |
| `israeli-idf`             | Israeli IDF              |
| `swiss-guard`             | Vatican Swiss Guard      |

**`ethnicity-blend`** (PRO) — 4 subs: `half-japanese`,
`half-nigerian`, `half-scandinavian`, `half-brazilian`. Premium.
ConsentModal gate.

Total: 33 subcategories (6 race + 3 gender + 6 age + 14 military +
4 ethnicity-blend).

---

## 7. Current state

### Works today

- Local-dev generation pipeline (Expo Router routes + Gemini
  client). Photo upload → detect → compose → generate → display
  → save to Firestore + Storage via `persistLocalGeneration`.
- Streaming NDJSON UX: tiles fill in one at a time as the model
  finishes each variant.
- Multi-person handling with three pipeline branches (solo /
  composer / sequential).
- All gating on the home screen: safety (blocked/flagged), minor
  hard-block on premium, paywall, consent modal.
- Sign in / sign up with email+password on all platforms; Apple
  Sign In on iOS only (button hidden on other platforms).
- Account deletion full flow: Firestore wipe → user doc delete →
  local AsyncStorage clear → Firebase Auth delete, with reauth
  fallback. Web-popup reauth for password / google.com / apple.com.
- Gallery with merged Firestore + local entries, dedupe by id,
  filter chips, Results/Compare view toggle, long-press delete.
- Result detail with BeforeAfterSlider (new 48px white handle,
  scale-on-drag spring), FilteredResultPanel (5 filters +
  watermark + Save + Share via captured view).
- Export account data (zip download / share).
- Marketing carousel hero on login at viewports ≥768px;
  compact wordmark on smaller.
- Sentry initialization (when DSN is set), tagged with uid only.
- Firestore rules deployed: owner-only reads, server-only writes
  on `generations`. Storage rules deployed: owner-only reads,
  all writes denied.
- TypeScript clean (`npx tsc --noEmit` passes).
- Tests clean (`npm test` → 19/19, 7 snapshots).

### Stubbed or incomplete

- **Cloud Functions are NOT DEPLOYED.** All function code is
  present and typechecks, but no deploy has been run. The client
  toggle (`EXPO_PUBLIC_CLOUD_FUNCTIONS_URL`) is empty in the
  current `.env` so the app runs entirely against local routes.
- **Server-side thumbnails.** The Cloud Function's
  `generate.ts` has a `TODO(thumbnails)` block — the
  recommended fix is installing the Firebase "Resize Images"
  extension rather than bundling `sharp`. Until then, gallery
  entries created via the Cloud Function path won't have
  `thumbURL` and the gallery falls back to full-res images.
- **RevenueCat is NOT CONFIGURED.** API keys (`iosKey`,
  `androidKey`) read from env and would be missing in the current
  setup; offerings would be empty; the PaywallModal would render
  with no plans. iOS/Android dev builds are needed before you
  can even test the IAP flow.
- **Privacy + Terms have placeholder emails.** `privacy@whatif.app`
  and `support@whatif.app` are baked into `app/privacy.tsx:140`
  and `app/terms.tsx:164` with inline "(replace with your real
  address" notes. Documented in `CLAUDE.md` parked todos.
- **Push notifications never tested.** `lib/notifications.ts` is
  wired correctly but requires a real device — won't work on
  simulator (gets a fake Expo token Expo rejects) or web. The
  notification-tap → deep-link path needs to be tested end-to-end
  on a real iOS + Android device.
- **Camera capture never tested on device.** Code path exists in
  `useImagePicker.capture()` but only the gallery pick has been
  exercised. Web is intentionally not wired (launchCameraAsync
  on web is inconsistent across browsers).
- **Reauth flow never tested with a throwaway account.** The
  ReauthModal exists and looks right; needs a real test where
  Firebase actually returns `auth/requires-recent-login`. This
  matters for App Store submission (account deletion is a
  required capability).
- **Native Google reauth not wired.** Web popup works; native
  shows the "log out and back in" fallback message. Would need
  `@react-native-google-signin/google-signin` in a dev build.
- **iOS dev build via `npx expo run:ios` has not been done.**
  Listed as #1 on the CLAUDE.md parked-todo list. Until this
  happens we can't test Apple Sign In, native push, native
  camera, native Google reauth, or native RevenueCat.
- **OnboardingTutorial doesn't fire on first launch in dev** —
  it's gated on `signedIn` and only stores state in AsyncStorage,
  so a fresh-install path needs the tutorial to fire; that path
  exists but hasn't been verified end-to-end on a device.
- **`framer-motion` dependency is unused** — listed in
  `package.json` but no imports found in the source tree. Stray
  from an early prototype; safe to remove (`npm uninstall
  framer-motion`).

### Recently resolved (commit `2a9050d`, pre-launch safety pass)

The first three items below were CRITICAL/HIGH findings from the
security review; they were the gates that had to land before
launch. Listed here so the history is clear — if any of these
regress, that's a red flag worth investigating.

- **(RESOLVED — was CRITICAL) Minor-detection gate is now
  server-side.** Both `functions/src/generate.ts` AND
  `app/api/generate+api.ts` re-run `runPeopleDetection` on the
  uploaded image when category is `race-swap`, `gender-swap`, or
  `ethnicity-blend`. Any `appearsUnder18` triggers a 403 refusal
  with "We can't generate this transformation on photos that may
  contain minors." Fail-CLOSED on detection errors (503). The
  client-supplied `containsMinor` flag is now a hint only —
  `moderation_log.serverDetectedMinor` is the source of truth.
- **(RESOLVED — was HIGH) Detect rate limit added.**
  `functions/src/detect.ts` now applies a Firestore-transaction
  sliding-window limiter (20/min per uid, keyed under
  `rateLimits/detect:{uid}` so it has independent budget from
  `generate`'s 10/min limiter). The local-dev route gets an
  in-memory limiter as a runaway-dev-script guard.
- **(RESOLVED — was HIGH) `selectedPeopleLabels` sanitized.** New
  `sanitizeLabel` / `sanitizeLabels` helpers in both
  `lib/prompts.ts` and `functions/src/prompts.ts` strip control
  chars (0x00–0x1f, 0x7f), strip quote variants (ASCII + curly),
  scrub instruction-injection trigger phrases (`ignore prior`,
  `disregard previous`, `system:`, `act as`, `<|im_start|>`
  tags, `[system]` brackets, etc.), and cap at 120 chars. Applied
  at four points: edge of both generate routes, inside
  `composePrompt` (both copies), inside `buildScopedPrompt` (both
  copies).
- **(RESOLVED) Political + celebrity mashup categories removed.**
  `political-mashup` and `celebrity-mashup` are gone from
  `constants/categories.ts`, `lib/prompts.ts`, and
  `functions/src/prompts.ts`. Re-mixing a named real person's
  likeness is a liability we're not taking at launch.
  `ethnicity-blend` remains as the only premium category.
- **(RESOLVED) Legal-page placeholders + back arrows.** Privacy
  and Terms now point at `[email protected]` (greppable),
  back-arrow Unicode glyphs swapped for lucide `<ArrowLeft />`,
  Terms copy updated to reflect the removed categories.

### Known broken / fragile

- **Signed Storage URLs valid for 365 days.** A leaked URL works
  for a year. Should rotate to short-lived URLs (e.g. 1h) and
  re-sign via an authed endpoint.
- **Image MIME type assumed `image/jpeg` server-side.** No
  magic-byte sniff before passing to Gemini or saving to Storage.
  Low-risk because RN's `<Image>` doesn't execute SVG script,
  but worth tightening for completeness.
- **Auto-commit hook auto-pushes to `main` on every Stop event**
  (Claude Code session boundary). The hook lives in
  `.claude/settings.local.json`. The path bug that silently
  suppressed it on Mac was fixed in this session, so commits
  + pushes will now actually happen. Commit messages are
  generic ("auto: update project files") — review the git log
  before treating any "main" state as a deliberate release tag.
- **`shadow*` style props deprecation warning** from the Expo
  Web bundler. RN announced these as deprecated in favor of
  `boxShadow`. Affects every component using
  `shadows.glow/card/elevated` from `theme.ts`. Cosmetic
  warning only; no user-visible impact today. Will need a sweep
  next time RN is bumped past 0.81.
- **No CI/CD configured.** No GitHub Actions, no EAS workflow.
  All checks (`npx tsc --noEmit`, `npm test`) are local-only.
- **Local-dev `persistLocalGeneration` writes to
  `generations/{id}` from the client**, but the deployed
  Firestore rules deny `create, update` on that collection. So
  the persist call fails silently on the live Firestore project
  unless rules were temporarily relaxed for dev. This is the
  inconsistency the security review flagged as MEDIUM — either
  the rules are wrong, the code path is dead, or there's a
  parallel "dev" rules file. Worth resolving before relying on
  Gallery filling in local-dev.

### Deferred

- `firebase-functions ^5 → ^6` upgrade. Has breaking changes
  around the Gen 2 default; deferred per CLAUDE.md.
- App Store / Play Store submission. Bundle IDs are set
  (`com.whatif.app`) but no builds have been pushed.

---

## 8. Environment & config

All vars read from `process.env` (Expo inlines `EXPO_PUBLIC_*` at
build time on SDK 50+) or from `Constants.expoConfig.extra` as a
legacy fallback.

### Public (client-side; `EXPO_PUBLIC_*` prefix)

| Key                                          | What it's for                                                            |
|---------------------------------------------|--------------------------------------------------------------------------|
| `EXPO_PUBLIC_FIREBASE_API_KEY`              | Firebase web API key — public, security via rules                        |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`          | Firebase auth domain (e.g. `whatif-98256.firebaseapp.com`)               |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID`           | `whatif-98256`                                                           |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`       | `whatif-98256.firebasestorage.app`                                       |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`  | FCM sender id                                                            |
| `EXPO_PUBLIC_FIREBASE_APP_ID`               | Firebase app id                                                          |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`        | RevenueCat iOS API key (consumer-facing)                                 |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`    | RevenueCat Android API key                                               |
| `EXPO_PUBLIC_SENTRY_DSN`                    | Sentry DSN; init no-ops cleanly when unset                               |
| `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL`           | Optional. When set, client hits this URL for `/generate` and `/detect`.  |
|                                              | Leave unset to use local Expo Router routes.                            |

### Server-only (no `EXPO_PUBLIC_*` prefix — never leaked to client)

| Key                          | Default                       | What it's for                                                    |
|------------------------------|-------------------------------|------------------------------------------------------------------|
| `GEMINI_API_KEY`             | —                             | Google AI API key. Required by `app/api/*+api.ts` AND the Cloud Functions. |
| `GEMINI_IMAGE_MODEL`         | `gemini-2.5-flash-image`      | Override Nano Banana model id (e.g. for preview models)          |
| `GEMINI_VISION_MODEL`        | `gemini-2.5-flash`            | Detection model id                                               |
| `GEMINI_COMPOSER_MODEL`      | `gemini-2.5-flash`            | Composer step model id                                           |
| `GEMINI_META_PROMPT_VARIANT` | `v1`                          | `v1` (unified plural) vs `v2` (enumerated per-person). v1 wins on 5-person race-swap. |
| `REVENUECAT_WEBHOOK_SECRET`  | —                             | Required by `functions/src/webhooks.ts`. Webhook fails closed when unset. |

Firebase Functions environment: `firebase functions:config:set
revenuecat.secret=...` works as a legacy fallback for
`REVENUECAT_WEBHOOK_SECRET` and `gemini.key=...` for
`GEMINI_API_KEY`.

---

## 9. Known issues & technical debt

Most of these are covered above; consolidated here for a single
pre-launch punch list.

### Security

Resolved in the pre-launch safety pass (commit `2a9050d`):

- ~~(CRITICAL) Minor-detection gate client-side only.~~ Fixed —
  server re-runs detection and refuses on `race-swap` /
  `gender-swap` / `ethnicity-blend` if any person flagged under
  18; fail-closed on detection errors. See §7 "Recently resolved"
  for details.
- ~~(HIGH) Detect Cloud Function lacks rate limiting.~~ Fixed —
  20/min per uid via Firestore transaction.
- ~~(HIGH) Prompt-injection via `selectedPeopleLabels`.~~ Fixed —
  `sanitizeLabels` applied at four points across the request
  lifecycle.

Still open:

- (MEDIUM) Signed Storage URLs valid 365 days. A leaked URL works
  for a year. Rotate to short-lived URLs and resign via an authed
  endpoint.
- (MEDIUM) Image MIME assumed JPEG server-side (no magic-byte
  sniff). RN's `<Image>` doesn't execute SVG script so the
  real-world risk is low, but worth tightening.
- (LOW) `moderation_log` and `logs` are append-only with no
  retention or per-user deletion on account delete. GDPR
  right-to-erasure technically requires this; the privacy
  policy carves them out as audit data. The new
  `moderation_log.outcome === 'refused-minor-gate'` rows store
  no PII beyond the uid and a categoryId, which is acceptable as
  audit data even post-account-deletion (uid alone is opaque).

### Reliability / correctness

- Firestore rules + `persistLocalGeneration` are inconsistent
  (see §7 Known broken). Either dead code or rules need an
  exception for local-dev.
- Cloud Functions code typechecks but has never been deployed,
  so the "production" code path is unverified end-to-end. The
  first deploy will likely surface env-var, IAM, and runtime
  config issues.
- Composer (Gemini Flash) failure → static-prompt fallback. Both
  paths are tested locally but the cascade hasn't been observed
  under a real Gemini outage; the `composed-fallback` branch
  exists but isn't exercised.
- 5s auth fallback in `useAuth` can incorrectly route a user to
  login if the auth listener is slow on a cold-start. Has not
  been observed in practice but is theoretically possible.

### Platform-specific gotchas

- **Web**:
  - No native push (web no-ops).
  - No IAP path (PaywallModal would render with no plans).
  - Apple Sign In is a popup; Google Sign In is a popup.
  - `react-native-purchases` has no real implementation on web —
    everything in `useSubscription` is guarded by `RC_AVAILABLE`.
  - Camera capture is hidden in `PhotoUploader` because
    `launchCameraAsync` on web has inconsistent behavior across
    browsers.
  - CORS on Firebase Storage is configured for `localhost:8081`
    and `localhost:19006` (per CLAUDE.md). Production web domain
    needs to be added before launch.
- **iOS**:
  - Apple Sign In needs `usesAppleSignIn: true` in app.json
    (set), the `expo-apple-authentication` plugin (set), and a
    dev build to test (NOT done yet).
  - Native Google reauth needs `@react-native-google-signin` in
    a dev build (NOT done yet).
  - Push tokens only work on real devices, not simulator.
  - Expo Go on iOS can no longer receive push notifications
    from the Expo Push API since 2024 — need an EAS dev build
    for any push testing.
- **Android**:
  - Adaptive icon background color is set; no foreground asset
    is bundled (Expo will warn).
  - AsyncStorage's legacy per-key ~6MB limit on Android still
    applies to old devices; `lib/localGallery.ts` has a halve-
    and-retry fallback when writes fail.

### Code-quality / tech debt

- Stray `framer-motion` dependency, never imported.
- `Subcategory.promptTemplate` field on `constants/categories.ts`
  is unused at runtime (verified — only the interface declaration
  itself references the field; no callsite ever reads
  `subcategory.promptTemplate`). The real prompts live in
  `lib/prompts.ts`. The whole text body is dead weight in the
  bundle; worth deleting in a cleanup pass.
- Privacy + Terms back arrows still use Unicode `←` (missed in
  the icon sweep). Easy fix: swap to lucide `<ArrowLeft />`.
- `categoryLabel` on `GenerationDoc` is set to `body.category` (the
  category **id**, e.g. `"race-swap"`) by the Cloud Function — not
  the actual user-facing label (e.g. `"Race Swap"`). Same bug in
  the local-dev `persistLocalGeneration` path. Either fix the
  writers to derive the real label, or drop the field and have the
  reader derive it client-side from `categoryId` via
  `getCategory(id)?.label`.
- The composer's meta-prompt variant flag (`GEMINI_META_PROMPT_VARIANT`)
  exists for A/B testing but has no analytics tying it to outcome
  metrics — the v1-wins claim is from manual eval, not a
  measured experiment.
- `[Unicode← in `app/privacy.tsx` and `app/terms.tsx`] — back
  buttons still use the Unicode arrow. Cosmetic.

---

## 10. Deployment status

### What exists

- **GitHub repository.** Auto-committed on every Claude Code
  Stop event (commit message: `"auto: update project files"`)
  + auto-pushed to `origin/main`. Hook is at
  `.claude/settings.local.json`. Cross-platform now that the
  Windows-path bug is fixed.
- **Firebase project: `whatif-98256`.**
  - Auth providers configured: email/password + Apple
    (Google needs a dev build to test).
  - Firestore: rules deployed, indexes deployed.
  - Storage: rules deployed, CORS configured for
    `localhost:8081` + `localhost:19006`.
  - Cloud Functions: NOT DEPLOYED. Code is present, builds
    clean, and would land if `firebase deploy --only functions`
    were run with the right env vars.
- **EAS project: `9a0a3710-aa2a-498e-8162-6b7b9ae7a490`.**
  Owner: `olytoma`. EAS init has been run, but no `eas build`
  invocations have happened — no iOS or Android binaries
  exist yet.
- **App identifiers reserved.** Bundle ID `com.whatif.app` for
  both iOS and Android (set in `app.json`). App Store / Play
  Store accounts and listings are not in scope of this repo.

### What still needs to happen

To get to an actual public launch, in roughly increasing order
of effort:

1. **Remove placeholder emails.** Get real `privacy@…` and
   `support@…` addresses; update `app/privacy.tsx:140` and
   `app/terms.tsx:164`.
2. **Drop the stray `framer-motion` dep.** `npm uninstall
   framer-motion`.
3. **Fix the privacy/terms back-arrow Unicode glyphs.** Tiny
   icon swap.
4. **Resolve the local-dev Firestore-rules inconsistency.**
   Either delete `persistLocalGeneration` or relax rules for
   dev.
5. **Configure RevenueCat.** Create iOS + Android entitlements,
   add offerings (weekly / monthly / yearly), get the API keys,
   set up the webhook secret. Without this the paywall is
   non-functional.
6. **Build the iOS dev build** via `npx expo run:ios` (or `eas
   build --platform ios --profile development`). Unblocks
   testing of Apple Sign In, native push, native camera, and
   native RevenueCat.
7. **Test push notifications + camera + reauth flow on a real
   iOS device.** All three are wired but never exercised
   end-to-end on a device.
8. **Fix the security findings.** At minimum the CRITICAL
   minor-gate; ideally the HIGH-severity ones too (detect rate
   limit, label sanitization).
9. **Install the Firebase "Resize Images" extension** for
   server-side thumbnails. Without it, Cloud-Function-generated
   gallery entries are full-res only.
10. **Deploy the Cloud Functions** with the right env vars
    (`GEMINI_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`). Run
    `firebase deploy --only functions`. Then set
    `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL` so the client hits them.
11. **Smoke-test the full pipeline against the deployed
    functions** before flipping the client over.
12. **Wire RevenueCat webhook URL** in the RevenueCat dashboard
    to the deployed `revenuecatWebhook` endpoint with the secret
    bearer.
13. **Add CORS for the production web domain** to Firebase
    Storage. The current allowlist is just localhost.
14. **EAS build + submit to App Store and Play Store.**
    Requires Apple Developer + Google Play accounts, app
    listings, screenshots, marketing copy, privacy/terms URLs,
    age rating, content rating questionnaires.
15. **Get a legal review of privacy + terms before public
    submission.** First-pass copy is honest-but-amateur; App
    Store reviewers expect more boilerplate.
16. **Consider a `firebase-functions` v5 → v6 upgrade** if
    you're going to redeploy anyway — better to be on the
    current major than to migrate later under pressure.

The shortest realistic path to "people can use this on iOS" is
steps 5–8 plus 10 (RevenueCat → iOS dev build → device test →
deploy functions). The web flow is closer to launchable today
since IAP isn't required and Apple/Google login degrade to
email/password — but you'd still want the security findings
addressed before pointing the world at it.
