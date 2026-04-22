import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export { generate } from './generate';
export { revenuecatWebhook } from './webhooks';
