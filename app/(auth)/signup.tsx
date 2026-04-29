import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, Pressable, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { signUpWithEmail, friendlyAuthErrorMessage } from '@/lib/auth';
import { colors, fontFamily, radii, spacing, typography } from '@/constants/theme';

export default function Signup() {
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) return show('Fill all fields.', 'error');
    if (password !== confirm) return show('Passwords do not match.', 'error');
    if (password.length < 6) return show('Password must be at least 6 characters.', 'error');
    setLoading(true);
    try {
      await signUpWithEmail(email.trim(), password);
    } catch (e) {
      show(friendlyAuthErrorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.brand}>
          <Text style={styles.logo}>
            What<Text style={styles.logoAccent}>If</Text>
          </Text>
          <Text style={styles.tagline}>Join the multiverse.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Create account</Text>
          <Text style={styles.cardTitle}>Get started</Text>

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
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <View>
              <Text style={styles.inputLabel}>Confirm password</Text>
              <TextInput
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <Button label="Sign up" onPress={handleSubmit} loading={loading} />
          </View>
        </View>

        <Text style={styles.fine}>
          By signing up you agree to our Terms of Service and Privacy Policy.
        </Text>

        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkText}>
              Have an account? <Text style={styles.linkAccent}>Log in</Text>
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
  fine: { ...typography.tiny, color: colors.textMuted, textAlign: 'center' },
  linkRow: { alignItems: 'center', padding: spacing.md },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkAccent: { color: colors.accent, fontWeight: '700' },
});
