// Storage-cleanup Cloud Functions.
//
// Why this exists:
// The image-storage layout for a generation is
//   users/{uid}/generations/{generationId}/original.jpg
//   users/{uid}/generations/{generationId}/result_0.jpg
//   users/{uid}/generations/{generationId}/result_1.jpg
//   …
//
// When the client (or a user-initiated account-deletion flow) deletes
// the corresponding Firestore documents, those Storage objects are
// orphaned. Doing the Storage cleanup synchronously from the client
// would require either listing the bucket prefix or remembering each
// result's storage path on the doc — both fragile compared to a
// server-side trigger that can simply delete by prefix.
//
// Two triggers, both Gen1 Firestore onDelete:
//
//   1. `generations/{id}` onDelete → delete
//      `users/{userId}/generations/{id}/` prefix.
//   2. `users/{uid}` onDelete → delete the entire `users/{uid}/`
//      prefix (catches every generation regardless of state).
//
// Trigger #2 fires during the account-deletion flow in lib/auth.ts,
// where the client deletes generations first (firing #1 once each)
// and then deletes the user doc (firing #2). The two triggers are
// safe to overlap — `deleteFiles` on an already-deleted prefix is a
// no-op rather than an error.
//
// Reliability:
//   - Cloud Functions retries on transient failures by default. We
//     don't need to layer our own retry on top of `deleteFiles`; if
//     a single batch fails the function retries.
//   - We log warnings rather than throw on permission/network errors,
//     because these triggers must NEVER block the upstream Firestore
//     delete (which is already complete by the time we run anyway).
//   - Empty prefix → no-op. Storage's `deleteFiles` is idempotent.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Sweep all Storage objects under a given prefix. Wraps the Storage
 * SDK's `deleteFiles` with a try/catch so an isolated cleanup failure
 * (network blip, transient permission error) is logged but doesn't
 * throw and trigger a Cloud Functions retry storm. The Firestore
 * delete that triggered us has already completed; we're best-effort
 * janitorial work, not a transactional dependency.
 *
 * `force: true` makes the call resilient to individual file delete
 * failures within the batch — we'd rather succeed at clearing 99/100
 * objects than abort the whole sweep.
 */
async function deletePrefix(prefix: string, label: string): Promise<void> {
  try {
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) {
      console.log(`[storageCleanup] ${label}: prefix "${prefix}" empty, nothing to delete`);
      return;
    }
    await bucket.deleteFiles({ prefix, force: true });
    console.log(`[storageCleanup] ${label}: deleted ${files.length} files at "${prefix}"`);
  } catch (err) {
    // Log + continue. The function shouldn't retry indefinitely on a
    // permission misconfig or a stale bucket reference; we'd rather
    // see the warning in logs and fix it manually than spin.
    console.warn(`[storageCleanup] ${label}: failed to delete prefix "${prefix}"`, err);
  }
}

/**
 * Trigger: `generations/{id}` deleted → sweep its result + original
 * images. Reads `userId` from the deleted doc snapshot to construct
 * the prefix; if the doc was already partially deleted somehow and
 * userId is missing, we log + bail rather than guessing.
 */
export const onGenerationDeleted = functions.firestore
  .document('generations/{id}')
  .onDelete(async (snap, context) => {
    const data = snap.data() as { userId?: string } | undefined;
    const userId = data?.userId;
    const generationId = context.params.id;
    if (!userId) {
      console.warn(
        `[storageCleanup] onGenerationDeleted: ${generationId} had no userId; skipping`,
      );
      return;
    }
    const prefix = `users/${userId}/generations/${generationId}/`;
    await deletePrefix(prefix, `gen ${generationId}`);
  });

/**
 * Trigger: `users/{uid}` deleted → sweep the user's entire Storage
 * subtree. Belt-and-suspenders to the per-generation trigger above:
 * the account-deletion flow normally walks generations first (firing
 * those triggers individually), but if that step partially fails or
 * the data was created out-of-band, this final sweep catches the
 * leftovers.
 *
 * We do NOT also delete moderation_log / logs entries here — those
 * are anonymized once the user doc is gone (no PII linkage), and the
 * privacy policy explicitly carves them out as audit data.
 */
export const onUserDeleted = functions.firestore
  .document('users/{uid}')
  .onDelete(async (_snap, context) => {
    const uid = context.params.uid;
    const prefix = `users/${uid}/`;
    await deletePrefix(prefix, `user ${uid}`);
  });
