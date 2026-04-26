import React from 'react';
import { SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '@/constants/theme';

// First-pass privacy policy. Deliberately plain language — no
// boilerplate legalese — because the value here is honest disclosure,
// not legal armor. A real lawyer pass before public launch is the
// right next step (especially for App Store submission), but having
// this in place now means the Profile screen's stub row navigates
// somewhere truthful instead of nowhere.

const LAST_UPDATED = 'April 2026';

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerLabel}>Account</Text>
          <Text style={styles.title}>Privacy Policy</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.meta}>Last updated: {LAST_UPDATED}</Text>

        <Section title="What we collect">
          <P>
            <B>Photos you upload.</B> We process the photos you choose to transform.
            They're sent to Google's Gemini API for the transformation itself, and
            (for signed-in users) the original plus generated results are stored in
            Firebase Cloud Storage so your gallery survives across sessions.
          </P>
          <P>
            <B>Account info.</B> If you create an account, we store the email, display
            name, and profile picture you supplied (or that came from Google / Apple
            sign-in). We also store your subscription status and a counter of free
            generations used.
          </P>
          <P>
            <B>Generation history.</B> A record of each generation — which category
            you picked, which subcategories, which (if any) people were detected as
            minors, which prompt variant we used — is stored so we can show your
            gallery and reconstruct what happened if a moderation issue arises.
          </P>
          <P>
            <B>Anonymous telemetry.</B> We log per-variant outcomes (success, failure,
            duration, prompt source, retry attempts) so we can fix bugs and tune
            prompts. No photos or PII are included in these logs.
          </P>
          <P>
            <B>Crash reports.</B> If the app errors out, a stack trace and your
            account's user id (no email, no display name, no photo) are sent to
            Sentry so we can fix the bug.
          </P>
        </Section>

        <Section title="What we don't collect">
          <P>
            We don't sell your data. We don't run ads. We don't track you across
            other apps or websites. We don't read your camera roll beyond the
            specific photos you pick to upload.
          </P>
        </Section>

        <Section title="Who else sees your data">
          <P>
            <B>Google Gemini API.</B> Your uploaded photo and the generation prompt
            are sent to Google's Gemini API for processing. Google's data handling
            for the Gemini API is governed by their own terms.
          </P>
          <P>
            <B>Firebase (Google).</B> Account info, generation records, and stored
            images live in Firebase services we operate.
          </P>
          <P>
            <B>RevenueCat.</B> If you subscribe to Pro, RevenueCat handles the
            purchase verification and subscription state.
          </P>
          <P>
            <B>Sentry.</B> Crash reports include your opaque user id so we can
            correlate errors per user, but no email or display name.
          </P>
        </Section>

        <Section title="How long we keep your data">
          <P>
            We keep your account, photos, generations, and gallery for as long as
            your account exists. When you delete your account (Profile → Delete
            Account), all of the above is removed. Anonymized telemetry logs
            referencing your former user id may persist for operational purposes
            but contain no personally identifiable information once your account
            is gone.
          </P>
        </Section>

        <Section title="Your rights">
          <P>
            <B>Delete everything.</B> Profile → Delete Account wipes your account,
            photos, and gallery in one action. This is irreversible.
          </P>
          <P>
            <B>Access or export.</B> Email us (see below) and we'll provide a copy of
            the data tied to your account.
          </P>
          <P>
            <B>Correct or restrict.</B> Email us and we'll address it.
          </P>
        </Section>

        <Section title="Children">
          <P>
            What If is not directed at children under 13. We don't knowingly
            collect data from children under 13. The app's people detection step
            additionally blocks the most sensitive transformation categories
            whenever any visible person is flagged as appearing under 18.
          </P>
        </Section>

        <Section title="Changes">
          <P>
            We may update this policy. The "Last updated" date at the top will
            change when we do. For substantive changes we'll surface a notice in
            the app the next time you open it.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions or requests: <B>privacy@whatif.app</B> (replace with your real
            address before launch).
          </P>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 26 },
  headerTitle: { alignItems: 'center', flex: 1 },
  headerLabel: { ...typography.label, color: colors.textLabel, fontSize: 10, marginBottom: 2 },
  title: { ...typography.h3, color: colors.textPrimary },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  meta: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.md },
  paragraph: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  bold: { color: colors.textPrimary, fontWeight: '700' },
});
