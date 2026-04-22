# What If — AI Photo Transformation App

Viral Gen-Z AI photo transformation app. Upload a photo, pick a "What If" scenario, get a grid of photorealistic edits.

## Stack

- React Native + Expo (managed) with Expo Router
- Zustand for state
- Firebase Auth / Firestore / Storage / Cloud Functions
- Google Gemini (Imagen) for image generation, called server-side
- RevenueCat for subscriptions
- react-native-reanimated + gesture-handler for the before/after slider

## Getting started

```bash
npm install
cp .env.example .env    # fill in Firebase + Gemini + RevenueCat keys
npx expo start
```

### Cloud Functions

```bash
cd functions
npm install
firebase login
firebase use --add
# Set secrets:
firebase functions:config:set gemini.key="YOUR_GEMINI_KEY" revenuecat.secret="YOUR_RC_WEBHOOK_SECRET"
npm run deploy
```

Expose `CLOUD_FUNCTIONS_URL` to the client (e.g. `https://us-central1-<project>.cloudfunctions.net`).

### RevenueCat webhook

Point RevenueCat's webhook at `${CLOUD_FUNCTIONS_URL}/revenuecatWebhook` with the shared secret.

## Structure

See the file tree in the prompt spec — every directory mentioned there is scaffolded.
