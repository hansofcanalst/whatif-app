import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export { generate } from './generate';
export { revenuecatWebhook } from './webhooks';
// Firestore-trigger cleanup. Fire when a generation or user doc is
// deleted to sweep their orphaned Storage objects. See storageCleanup.ts
// for the rationale.
export { onGenerationDeleted, onUserDeleted } from './storageCleanup';
// Generation-complete push notification (task 2 below).
export { onGenerationCompleted } from './notifyOnComplete';
