# EAS environment variables — production secrets

EAS CLI 19's `eas.json` schema rejects unknown keys (including the
`_doc` block I tried at first), so this sibling doc holds the list of
EXPO_PUBLIC_* env vars the production build expects. Keep this file
in sync with `constants/config.ts`, `.env.example`, and
`PROGRESS_LOG.md` whenever the env-var surface area changes.

## Currently required by the production build

Each of the following must exist in EAS as a `production`-environment
variable before running `eas build --profile production`. Without the
EXPO_PUBLIC_* vars, the bundle inlines `undefined` and `lib/apiBase.ts`
throws at runtime on every generate / detect call (release-only
crash). Without `SENTRY_DISABLE_AUTO_UPLOAD`, the Xcode build phase
errors at fastlane and the whole build fails.

`sensitive` visibility (8):
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL`
- `EXPO_PUBLIC_SENTRY_DSN`

`plaintext` visibility (1):
- `SENTRY_DISABLE_AUTO_UPLOAD` = `true` — disables the
  `@sentry/react-native` Xcode build-phase source-map upload (which
  hard-fails without org+token). Remove this var as part of the v1.1
  Sentry setup (see below). See PROGRESS_LOG 2026-05-30.

## Required for v1.1 when monetization re-enables

Add these alongside flipping `V1_MONETIZATION_ENABLED` to `true` in
`constants/config.ts`:

`sensitive` visibility (2):
- `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
- `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`

## Required for v1.1 when Sentry source-map upload re-enables

Set these AND `eas env:delete SENTRY_DISABLE_AUTO_UPLOAD` so the
build-phase script runs the upload step again. With these in place,
Sentry crash reports become symbolicated (real function names instead
of Hermes byte offsets):

`plaintext` visibility (2):
- `SENTRY_ORG` — your sentry.io org slug
- `SENTRY_PROJECT` — your sentry.io project slug

`secret` visibility (1):
- `SENTRY_AUTH_TOKEN` — from sentry.io Account → Auth Tokens, scope
  `project:releases`. Use `secret` (not `sensitive`) so the value is
  never re-readable through the CLI / dashboard after creation. If
  you lose it, rotate at sentry.io and recreate the env var.

## Commands

```sh
# Create one (values come from your local .env):
eas env:create --environment production --name <NAME> \
  --value <VALUE> --visibility sensitive --scope project

# List names + presence (values are redacted for `sensitive`):
eas env:list --environment production --format short

# Update an existing var:
eas env:update --environment production --name <NAME>
```

Visibility = `sensitive` is the right default for these: values are
encrypted at rest in EAS, redacted in build logs, but still readable
through the dashboard if you need to verify. Don't use `secret` for
these — `secret` is write-only and we'd lose the ability to verify
later.
