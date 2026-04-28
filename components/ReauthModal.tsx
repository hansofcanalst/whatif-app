// Reauth modal — shown when an operation that requires recent login
// (currently: account deletion) hits Firebase's
// `auth/requires-recent-login`. Lets the user re-prove their identity
// inline instead of going through a manual sign-out + sign-in dance.
//
// Branches on the user's primary auth provider:
//
//   - password    → password input + reauth button
//   - google.com  → web: Firebase reauthenticateWithPopup;
//                   native: shows the "log out and back in" fallback
//                   (native Google reauth requires the
//                   @react-native-google-signin native module which
//                   only works in dev builds, not Expo Go — punted
//                   until iOS/Android dev builds are set up).
//   - apple.com   → same pattern as Google but via OAuthProvider
//   - other       → fallback message (anonymous accounts, OAuth
//                   providers we haven't wired up explicitly)
//
// Why we can't reuse the sign-in screens for reauth:
//   - Sign-in routes the user through navigation; reauth is a
//     transient interaction that should leave them on Profile.
//   - Sign-in calls `ensureUserDoc` and other side effects that don't
//     belong in a "prove you're still you" check.
//   - The Firebase reauth APIs are distinct from the sign-in APIs —
//     `reauthenticateWithCredential` keeps the same uid; signing in
//     fresh would technically work but creates a separate session
//     transition the auth listener has to deal with.

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { Button } from './ui/Button';
import {
  getPrimaryProviderId,
  reauthWithPassword,
  reauthWithGooglePopup,
  reauthWithApplePopup,
  type AuthProviderId,
} from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface ReauthModalProps {
  visible: boolean;
  /**
   * Fires after a successful reauth. The caller (ProfileScreen) uses
   * this to retry the previously-requires-recent-login operation —
   * typically `finishAccountDeletion()`.
   */
  onSuccess: () => void;
  /**
   * Fires when the user backs out without completing reauth. The
   * destructive operation should NOT proceed in this case.
   */
  onClose: () => void;
}

export function ReauthModal({ visible, onSuccess, onClose }: ReauthModalProps) {
  const user = auth.currentUser;
  const provider: AuthProviderId = user ? getPrimaryProviderId(user) : 'other';
  // Native popup reauth is unsupported until a dev build is set up
  // (the modules @react-native-google-signin and
  // expo-apple-authentication need to be linked, and Firebase's
  // popup flow is web-only). On native we degrade to the explanation
  // path for OAuth providers.
  const popupSupported = Platform.OS === 'web';

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleClose = () => {
    if (busy) return;
    setPassword('');
    onClose();
  };

  const succeed = () => {
    setPassword('');
    setBusy(false);
    onSuccess();
  };

  const fail = (e: unknown) => {
    setBusy(false);
    const code = (e as { code?: string })?.code;
    let message = 'Reauthentication failed. Please try again.';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      message = 'Wrong password. Please try again.';
    } else if (code === 'auth/too-many-requests') {
      message = 'Too many attempts. Please wait a moment and try again.';
    } else if (code === 'auth/popup-closed-by-user') {
      // User cancelled the popup themselves — silent.
      return;
    } else if (e instanceof Error) {
      message = e.message;
    }
    Alert.alert('Reauthentication failed', message);
  };

  const handlePasswordSubmit = async () => {
    if (busy || !password) return;
    setBusy(true);
    try {
      await reauthWithPassword(password);
      succeed();
    } catch (e) {
      fail(e);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reauthWithGooglePopup();
      succeed();
    } catch (e) {
      fail(e);
    }
  };

  const handleApple = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reauthWithApplePopup();
      succeed();
    } catch (e) {
      fail(e);
    }
  };

  const renderBody = () => {
    if (provider === 'password') {
      return (
        <>
          <Text style={styles.body}>
            For your security, please re-enter your password to continue.
          </Text>
          <Text style={styles.emailLabel}>{user?.email}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
            onSubmitEditing={handlePasswordSubmit}
          />
          <Button
            label={busy ? 'Verifying…' : 'Continue'}
            onPress={handlePasswordSubmit}
            disabled={busy || !password}
            style={{ marginTop: spacing.md }}
          />
        </>
      );
    }
    if (provider === 'google.com') {
      if (!popupSupported) return renderNativeFallback('Google');
      return (
        <>
          <Text style={styles.body}>
            For your security, please reconfirm your Google account to continue.
          </Text>
          <Button
            label={busy ? 'Opening Google…' : 'Continue with Google'}
            onPress={handleGoogle}
            disabled={busy}
            style={{ marginTop: spacing.md }}
          />
        </>
      );
    }
    if (provider === 'apple.com') {
      if (!popupSupported) return renderNativeFallback('Apple');
      return (
        <>
          <Text style={styles.body}>
            For your security, please reconfirm your Apple account to continue.
          </Text>
          <Button
            label={busy ? 'Opening Apple…' : 'Continue with Apple'}
            onPress={handleApple}
            disabled={busy}
            style={{ marginTop: spacing.md }}
          />
        </>
      );
    }
    return (
      <>
        <Text style={styles.body}>
          We can't reconfirm your account inline yet. Please log out, sign in
          again, then retry the action.
        </Text>
        <Button
          label="OK"
          onPress={handleClose}
          style={{ marginTop: spacing.md }}
        />
      </>
    );
  };

  // Inline reauth via a popup isn't wired on native yet (see file
  // header). We surface a clear, polished message that's better than
  // the old plain Alert.alert without misleading the user.
  function renderNativeFallback(providerName: string) {
    return (
      <>
        <Text style={styles.body}>
          To finish this for security reasons, please log out and sign in with
          {' '}
          {providerName} again, then retry. Inline reconfirmation will be
          available on the next iOS/Android update.
        </Text>
        <Button
          label="OK"
          onPress={handleClose}
          style={{ marginTop: spacing.md }}
        />
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />
          <Pressable
            onPress={handleClose}
            style={styles.closeBtn}
            hitSlop={8}
            disabled={busy}
            accessibilityLabel="Close"
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
            <Text style={styles.title}>Confirm it's you</Text>
            {renderBody()}
            {!busy ? (
              <Pressable onPress={handleClose} style={{ marginTop: spacing.md }}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    maxHeight: '85%',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 2,
    padding: spacing.sm,
  },
  closeText: { color: colors.textSecondary, fontSize: 18 },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: -0.5,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  emailLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  input: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    ...typography.body,
  },
  cancel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
