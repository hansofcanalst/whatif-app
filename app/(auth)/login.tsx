import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Link } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Button } from '@/components/ui/Button';
import { FeatureCarousel } from '@/components/ui/FeatureCarousel';
import { useToast } from '@/components/ui/Toast';
import { signInWithEmail, signInWithAppleIdToken, friendlyAuthErrorMessage } from '@/lib/auth';
import { colors, fontFamily, radii, spacing, typography } from '@/constants/theme';

// Marketing carousel images. Mix of portrait + scene photos from
// Unsplash CDN so the hero reads as "any photo, any direction" rather
// than locking to faces only. Five images keeps the 3D-fan stack
// readable — fewer and the side cards collapse, more and the
// peripheral cards never get into view before they wrap. URLs are
// long-lived Unsplash IDs (same ones in the reference design).
const HERO_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1504051771394-dd2e66b2e08f?w=900&auto=format&fit=crop&q=60',
    alt: 'Professional portrait of a woman',
  },
  {
    src: 'https://images.unsplash.com/photo-1526510747491-58f928ec870f?w=900&auto=format&fit=crop&q=60',
    alt: 'Scenic landscape with mountains and a lake',
  },
  {
    src: 'https://plus.unsplash.com/premium_photo-1670282392820-e3590c1c5c54?w=900&auto=format&fit=crop&q=60',
    alt: 'Artistic photo of a person with flowers',
  },
  {
    src: 'https://images.unsplash.com/photo-1581403341630-a6e0b9d2d257?w=900&auto=format&fit=crop&q=60',
    alt: 'A dog wearing sunglasses',
  },
  {
    src: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=900&auto=format&fit=crop&q=60',
    alt: 'Creative shot of a person from behind',
  },
];

// Hero title with the accent word in violet. Nested <Text> works in
// RN so the gradient-text trick from the web reference (Tailwind's
// bg-clip-text) is replaced by a clean solid accent — matches the
// FRAME palette better and renders consistently on every platform.
const HERO_TITLE = (
  <>
    See yourself <Text style={{ color: colors.accent }}>across the multiverse</Text>
  </>
);

const HERO_SUBTITLE =
  'Drop a photo. Pick a direction — race, age, gender, military, celebrities, and more. AI-powered transformations in seconds.';

export default function Login() {
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Show the marketing carousel hero on wide viewports only. On
  // mobile (native or narrow web) the carousel would push the login
  // form below the fold and slow down returning users — keep the
  // compact wordmark header there. 768px matches the standard
  // tablet/desktop breakpoint we use elsewhere (gallery, web CSS).
  const { width: windowWidth } = useWindowDimensions();
  const showCarousel = windowWidth >= 768;

  const handleEmail = async () => {
    if (!email || !password) return show('Enter email and password.', 'error');
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (e) {
      show(friendlyAuthErrorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    try {
      // Firebase's Apple credential exchange (JS SDK → signInWithIdp)
      // requires a nonce to bind the identity token to this request and
      // block replay. The dance: make a raw random nonce, send Apple the
      // SHA-256 HASH of it, then hand Firebase the RAW nonce. Apple embeds
      // the hash in the returned identity token; Firebase re-hashes our
      // raw nonce and checks the two match. Skipping this is what made
      // sign-in fail with auth/invalid-credential — surfaced (misleadingly)
      // as a "wrong email or password" toast. See signInWithAppleIdToken.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (cred.identityToken) {
        await signInWithAppleIdToken(cred.identityToken, rawNonce);
      }
    } catch (e: any) {
      // Silent on user-cancelled (Apple's `ERR_REQUEST_CANCELED`); show a
      // provider-specific message for everything else so an Apple failure
      // never masquerades as an email/password error again.
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      show(friendlyAuthErrorMessage(e, 'apple'), 'error');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        {showCarousel ? (
          // Wide-viewport hero. Replaces the compact wordmark block on
          // tablet/desktop with a 3D-fan photo carousel + marketing
          // copy — the first-impression surface for users landing on
          // the web app. The compact form sits below.
          <FeatureCarousel
            title={HERO_TITLE}
            subtitle={HERO_SUBTITLE}
            images={HERO_IMAGES}
            style={styles.carouselWrap}
          />
        ) : (
          <View style={styles.brand}>
            <Text style={styles.logo}>
              What<Text style={styles.logoAccent}>If</Text>
            </Text>
            <Text style={styles.tagline}>See yourself in a whole new way.</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Sign in</Text>
          <Text style={styles.cardTitle}>Welcome back</Text>

          <View style={styles.form}>
            <View>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>
            <View>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <Button label="Log in" onPress={handleEmail} loading={loading} />
          </View>

          {Platform.OS === 'ios' ? (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={radii.lg}
                style={styles.appleBtn}
                onPress={handleApple}
              />
            </>
          ) : null}
        </View>

        <Link href="/(auth)/signup" asChild>
          <Pressable
            style={styles.linkRow}
            accessibilityRole="link"
            accessibilityLabel="Don't have an account? Sign up"
          >
            <Text style={styles.linkText}>
              No account? <Text style={styles.linkAccent}>Sign up</Text>
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: spacing.xxxl * 1.5,
    gap: spacing.xl,
    backgroundColor: colors.bg,
  },
  // Constrain the form card width on wide viewports so the page reads
  // as "marketing hero, then sign-in form" rather than a stretched
  // edge-to-edge form. The carousel itself is full-bleed (it owns
  // its own container width).
  carouselWrap: {
    width: '100%',
    alignSelf: 'center',
    marginHorizontal: -spacing.xl,
  },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: {
    fontFamily: fontFamily.mono,
    fontSize: 40,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -1.5,
  },
  logoAccent: { color: colors.accent },
  tagline: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
    // Cap the sign-in card width on desktop so it reads as a
    // contained surface beneath the full-bleed carousel, not a giant
    // edge-to-edge form.
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  sectionLabel: { ...typography.label, color: colors.textLabel },
  cardTitle: { ...typography.h2, color: colors.textPrimary },
  form: { gap: spacing.md },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bgInput,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.label, color: colors.textMuted, fontSize: 10 },
  appleBtn: { height: 48, width: '100%' },
  linkRow: { alignItems: 'center', padding: spacing.md },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkAccent: { color: colors.accent, fontWeight: '700' },
});
