# What If — Project context for Claude Code

Auto-loaded by Claude Code on every session. Keep concise; every token
here is paid on every conversation.

## What this is

React Native / Expo SDK 54 app that uses Gemini AI to transform user
photos. Drop a photo, pick a direction (race / age / gender / military /
celebrity mashup / etc.), get a transformed image back. Iterates via
streaming NDJSON so tiles fill in one-by-one.

**Status:** feature-complete, shipping-ready. Local-dev and prod (Cloud
Function) paths both work. Tests + typechecks clean.

## Tech stack

- **App:** Expo 54, React Native 0.81, expo-router (file-based), Zustand
  for state, react-native-reanimated, TypeScript strict
- **Backend:** Firebase Auth + Firestore + Storage; Firebase Cloud
  Functions Gen1 on Node 22
- **AI:** Gemini 2.5-flash-image (Nano Banana — image gen),
  gemini-2.5-flash (vision + composer)
- **Payments:** RevenueCat (native only — web no-ops)
- **Observability:** Sentry (client errors), Firestore `logs/` collection
  (per-variant server telemetry), `moderation_log` (audit)
- **Project ID:** `whatif-98256`. Cloud Functions live at
  `https://us-central1-whatif-98256.cloudfunctions.net/{name}`

## Directory map (the important bits)

```
app/                    Expo Router screens
  (auth)/               login + signup (Apple Sign In native-only)
  (tabs)/               home, gallery, profile
  api/                  Expo Router server routes (local dev)
    generate+api.ts     Mirror of functions/src/generate.ts
    detect+api.ts       Mirror of functions/src/detect.ts
  generate/             [categoryId] picker + results stream
  result/[id].tsx       Result detail (slider, filters, watermark)
  dev/prompt-eval.tsx   Dev-only prompt matrix screen
components/             UI primitives + feature components
hooks/                  useAuth, useGeneration, useImagePicker, useSubscription
lib/                    Pure modules: auth, firebase, firestore, storage,
                        gemini, detect, prompts, composePrompt, sentry,
                        notifications, localGallery, exportData, ...
stores/                 Zustand stores: auth, generation, subscription
constants/              theme, categories (UI catalog), config
functions/src/          Cloud Functions: generate, detect, webhooks,
                        storageCleanup, notifyOnComplete, prompts
__tests__/              Jest snapshot tests on prompt catalog
```

## Architecture decisions worth remembering

- **Two prompt catalogs kept in sync:** `lib/prompts.ts` (used by local
  dev `app/api/generate+api.ts`) and `functions/src/prompts.ts` (used by
  the Cloud Function). When editing prompts, update both. Snapshot tests
  catch accidental drift on the lib/ side.
- **Generation pipeline branching:** solo subject = static prompt;
  multi-person subset = composer single-pass; multi-person 2+ selected =
  SEQUENTIAL per-person passes. See comment block in
  `app/api/generate+api.ts` around the `shouldSequence` flag for the
  rationale (Nano Banana drops harder subjects in one-shot multi-person
  edits when transformation is strong).
- **Streaming:** server emits NDJSON events (`start`, `result`, `error`,
  `done`, `fatal`); client `lib/gemini.ts streamGeneration()` parses
  line-by-line. Client navigates to /results on first event (`onReady`).
- **Local-dev vs prod path:** if `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL` is
  set, client hits deployed Cloud Function. Otherwise hits Expo Router's
  local `/api/generate`. Local dev path still writes generations to
  Firestore + Storage via `persistLocalGeneration` so Gallery populates.
- **Detection cache:** `lib/detectionCache.ts` — re-picking the same
  photo (same bytes) short-circuits the Gemini detect call. Keyed by
  FNV-1a hash of base64.
- **Thumbnails:** local-dev path generates 256px thumbs at upload time
  via `expo-image-manipulator` and writes `thumbURL` to Firestore. The
  Cloud Function path doesn't yet — TODO is to install Firebase
  "Resize Images" extension rather than bundle sharp.
- **Auth security:** `firestore.rules` enforces owner-only reads/writes
  per collection. `moderation_log` and `logs` are server-only (Cloud
  Function via Admin SDK bypasses rules). Client writes to those would
  be silently denied.
- **RevenueCat is iOS/Android only.** All call sites in `hooks/
  useSubscription.ts` and `lib/revenuecat.ts` early-return on web. Pro
  status on web is read from the user doc's `subscriptionStatus`
  (set by the RevenueCat webhook in `functions/src/webhooks.ts`).
- **Watermark + filters:** result detail screen captures the rendered
  View via `react-native-view-shot` so saved/shared bytes include
  whatever filter and watermark the user has selected.

## Common commands

```bash
# Root (app)
npm start                  # Metro dev server
npm test                   # Run prompt snapshot tests
npm run test:update        # Update snapshots when prompts change intentionally
npx tsc --noEmit           # Typecheck

# Cloud Functions
cd functions
npx tsc --noEmit
firebase deploy --only functions:NAME      # Deploy a specific function
firebase deploy --only firestore:rules     # Push rules
firebase deploy --only firestore:indexes   # Push indexes
firebase functions:log --only NAME         # Tail logs

# iOS native dev build (Mac only)
npx expo run:ios

# Android via Expo Go
npm start  # scan QR with Expo Go app
```

## Env vars (`.env` — never committed)

Public (client-side, EXPO_PUBLIC_ prefix required):
- `EXPO_PUBLIC_FIREBASE_*` — six keys, copy from Firebase console
- `EXPO_PUBLIC_REVENUECAT_API_KEY_{IOS,ANDROID}`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL` — optional; set to point at deployed
  functions instead of local /api routes

Server-only (no EXPO_PUBLIC_ prefix):
- `GEMINI_API_KEY` — used by `app/api/*+api.ts` and `functions/src/*`
- `GEMINI_IMAGE_MODEL`, `GEMINI_VISION_MODEL`, `GEMINI_COMPOSER_MODEL` —
  optional overrides, defaults are `gemini-2.5-flash-image` and
  `gemini-2.5-flash`

## Active todos (parked between sessions)

1. **iOS dev build via `npx expo run:ios`** — unlocks items 2–5
2. Test push notifications on a real iOS device
3. Test camera capture on a real device
4. Test reauth flow for account deletion (use a throwaway account)
5. Wire native Google/Apple reauth (requires #1 + native modules)
6. Replace placeholder emails (`privacy@whatif.app`, `support@whatif.app`)
   in `app/privacy.tsx` and `app/terms.tsx` — waiting on a real address
7. Install Firebase "Resize Images" extension for server-side thumbnails
8. Upgrade `firebase-functions` ^5 → ^6 (has breaking changes — defer)

## Notes / gotchas

- **Auto-commit hook** appears to be running on Windows (every file
  change becomes "auto: update project files" commits). On Mac you may
  want to commit manually for cleaner history.
- **CORS on Firebase Storage** is configured to allow `localhost:8081`
  and `localhost:19006` (see `gsutil cors get gs://whatif-98256.firebasestorage.app`).
  Add your production web domain when shipping.
- **Firestore composite index** for `generations where userId == ? order
  by createdAt desc` is deployed. If you ever see "The query requires an
  index" again, run `firebase deploy --only firestore:indexes`.
- **Account deletion** wipes Firestore data + AsyncStorage + Firebase
  Auth in order. Storage objects orphan (cleanup via Cloud Function
  triggers `onGenerationDeleted` + `onUserDeleted`).
- **Snapshot tests cover prompts only** — UI tests, component tests, and
  hook tests don't exist yet (intentional — prompt regressions matter
  most).

## When in doubt

- Look for the closest existing pattern and follow it.
- The codebase uses extensive in-file comments explaining "why" — read
  them before changing adjacent code.
- Both prompt catalogs (`lib/prompts.ts` and `functions/src/prompts.ts`)
  must stay in sync; same for the two detect endpoints.
