# EAS environment variables — production secrets

EAS CLI 19's `eas.json` schema rejects unknown keys (including the
`_doc` block I tried at first), so this sibling doc holds the list of
EXPO_PUBLIC_* env vars the production build expects. Keep this file
in sync with `constants/config.ts`, `.env.example`, and
`PROGRESS_LOG.md` whenever the env-var surface area changes.

## Currently required by the production build

Each of the following must exist in EAS as a `production`-environment
variable before running `eas build --profile production`. Without them,
the bundle inlines `undefined` and `lib/apiBase.ts` throws at runtime
on every generate / detect call (release-only crash).

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL`
- `EXPO_PUBLIC_SENTRY_DSN`

## Required for v1.1 when monetization re-enables

Add these alongside flipping `V1_MONETIZATION_ENABLED` to `true` in
`constants/config.ts`:

- `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
- `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`

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
